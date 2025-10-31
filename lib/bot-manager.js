const TelegramBot = require('node-telegram-bot-api');
const BrainLoader = require('./brain-loader');
const ImageProfileLoader = require('./image-profile-loader');
const SessionManager = require('./session-manager');
const RateLimiter = require('./rate-limiter');
const { sendToClaudeSession, sendToClaudeWithTTS, sendToClaudeWithImage } = require('./claude-client');
const logger = require('./logger');

/**
 * BotManager
 *
 * Manages multiple Telegram bot instances, each with its own personality (brain).
 * Handles message routing, session management, and Claude integration.
 */
class BotManager {
  constructor(options = {}) {
    this.bots = new Map(); // botId → { bot: TelegramBot, config: {...}, brain: {...}, lastHealthCheck: Date, status: 'healthy' }
    this.brainLoader = new BrainLoader();
    this.imageProfileLoader = new ImageProfileLoader();
    this.sessionManager = new SessionManager();
    this.rateLimiter = new RateLimiter();
    this.claudeCmd = options.claudeCmd || 'claude';

    // Track active conversations (for streaming)
    this.activeConversations = new Map(); // chatId → { statusMsg, lastUpdate }

    // Health check interval (every 30 seconds)
    this.healthCheckInterval = setInterval(() => this.performHealthChecks(), 30000);
  }

  /**
   * Add a bot to the manager
   *
   * @param {Object} config - Bot configuration
   * @param {string} config.id - Unique bot identifier
   * @param {string} config.token - Telegram bot token
   * @param {string} config.brain - Brain file name
   * @param {boolean} [config.active=true] - Whether bot is active
   */
  addBot(config) {
    const { id, token, brain, active = true } = config;

    if (!id || !token || !brain) {
      throw new Error('Bot config must include: id, token, brain');
    }

    if (!active) {
      console.log(`⏸️  Bot ${id} is inactive, skipping`);
      return;
    }

    // Load and validate brain
    const brainConfig = this.brainLoader.load(brain);

    // Create Telegram bot instance
    const bot = new TelegramBot(token, { polling: true });

    // Store bot info
    this.bots.set(id, {
      bot,
      config,
      brain: brainConfig,
      status: 'healthy',
      lastHealthCheck: new Date(),
      messageCount: 0,
      errorCount: 0
    });

    // Set up message handler
    bot.on('message', (msg) => this.handleMessage(id, msg));

    // Set up error handler
    bot.on('polling_error', (error) => {
      logger.bot(id, 'error', 'Polling error', { error: error.message });
      this.handleBotError(id, error);
    });

    logger.bot(id, 'info', `Bot started: ${brainConfig.name || id}`);
  }

  /**
   * Handle incoming Telegram message
   *
   * @param {string} botId - Bot identifier
   * @param {Object} msg - Telegram message object
   */
  async handleMessage(botId, msg) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || msg.caption?.trim() || '';
    const hasPhoto = msg.photo && msg.photo.length > 0;

    // Ignore messages with no text AND no photo
    if (!text && !hasPhoto) return;

    const botInfo = this.bots.get(botId);
    if (!botInfo) {
      console.error(`❌ Bot ${botId} not found`);
      return;
    }

    const { bot, brain } = botInfo;

    // Log incoming message
    const logText = hasPhoto ? `[PHOTO] ${text || '(no caption)'}` : text;
    logger.user(botId, msg.from.id, 'info', 'Message received', {
      username: msg.from.username || msg.from.first_name,
      text: logText.substring(0, 100),
      hasPhoto
    });

    // Update message count
    botInfo.messageCount++;

    // Handle commands
    if (text.startsWith('/')) {
      return this.handleCommand(botId, msg);
    }

    // Check rate limit
    const rateLimit = this.rateLimiter.checkLimit(botId, msg.from.id, brain);
    if (!rateLimit.allowed) {
      const resetTime = new Date();
      resetTime.setHours(24, 0, 0, 0); // Midnight
      await bot.sendMessage(chatId,
        `⏸️ You've reached your daily limit of ${rateLimit.limit} messages.\n\n` +
        `Resets at midnight. Current: ${rateLimit.current}/${rateLimit.limit}`
      );
      logger.user(botId, msg.from.id, 'warn', 'Rate limit exceeded', rateLimit);
      return;
    }

    // Handle regular message
    try {
      // Send "thinking" indicator
      const statusMsg = await bot.sendMessage(chatId, '⏳ Thinking...');

      // Handle photo if present
      let photoBase64 = null;
      let photoMediaType = null;
      if (hasPhoto) {
        try {
          // Get highest quality photo (last item in array)
          const photo = msg.photo[msg.photo.length - 1];
          const file = await bot.getFile(photo.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${botInfo.config.token}/${file.file_path}`;

          // Create images directory if it doesn't exist
          const imagesDir = require('path').join(process.cwd(), 'telegram-images');
          if (!require('fs').existsSync(imagesDir)) {
            require('fs').mkdirSync(imagesDir, { recursive: true });
          }

          // Download and save the image
          const timestamp = Date.now();
          const filename = `${botId}-user-${msg.from.id}-${timestamp}.jpg`;
          const photoPath = require('path').join(imagesDir, filename);

          // Download using node-fetch or https
          const https = require('https');
          const fs = require('fs');
          const fileStream = fs.createWriteStream(photoPath);

          await new Promise((resolve, reject) => {
            https.get(fileUrl, (response) => {
              response.pipe(fileStream);
              fileStream.on('finish', () => {
                fileStream.close();
                resolve();
              });
            }).on('error', (err) => {
              fs.unlink(photoPath, () => {}); // Delete partial file
              reject(err);
            });
          });

          console.log(`📸 [${botId}] Downloaded photo: ${photoPath}`);

          // Convert to base64 for Claude API
          const imageBuffer = fs.readFileSync(photoPath);
          photoBase64 = imageBuffer.toString('base64');
          photoMediaType = 'image/jpeg'; // Telegram photos are always JPEG

          console.log(`🔄 [${botId}] Converted photo to base64 (${photoBase64.length} chars)`);
        } catch (photoError) {
          console.error(`❌ [${botId}] Failed to process photo:`, photoError.message);
          // Continue without photo
        }
      }

      // Build system prompt
      const systemPrompt = this.brainLoader.buildSystemPrompt(
        botInfo.config.brain,
        msg.from
      );

      // Get session info - use session manager for persistence
      const currentUuid = this.sessionManager.getCurrentUuid(botId, msg.from.id);
      const isNewSession = !currentUuid;

      if (isNewSession) {
        console.log(`🆕 [${botId}] New session for user ${msg.from.id}`);
      } else {
        console.log(`📝 [${botId}] Resuming session ${currentUuid.substring(0, 8)}... for user ${msg.from.id}`);
      }

      // Prepare message
      // For new sessions, include system prompt
      // For resumed sessions, just send the user message (context is persisted)

      // Security reminder - sent with EVERY message to prevent role drift
      // Get from brain loader (respects brain's security profile)
      const securityReminder = this.brainLoader.getSecurityReminder(botInfo.config.brain);

      // Build message content based on whether we have an image
      let fullMessage;
      let messageContent = null; // For structured content (images)

      if (photoBase64) {
        // MULTI-MODAL MODE: Image present
        // We need to structure content as an array for Claude API
        // System prompt and security reminder go in text, then user content is structured

        let prefixText;
        if (isNewSession) {
          // New session: system prompt + security reminder (if enabled)
          prefixText = securityReminder
            ? `${systemPrompt}\n\n---\n\n${securityReminder}\n\nUser says:`
            : `${systemPrompt}\n\nUser says:`;
        } else {
          // Resumed session: just security reminder (if enabled)
          prefixText = securityReminder
            ? `${securityReminder}\n\nUser says:`
            : `User says:`;
        }

        messageContent = [
          {
            type: 'text',
            text: `${prefixText}\n${text || '(user sent an image)'}`
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: photoMediaType,
              data: photoBase64
            }
          }
        ];

        // fullMessage is not used when we have messageContent, but set it for logging
        fullMessage = `${prefixText}\n${text || '(user sent an image)'} [IMAGE]`;

      } else {
        // TEXT-ONLY MODE: No image
        // Use traditional string format (more efficient)
        if (isNewSession) {
          // New session: system prompt + security reminder (if enabled)
          fullMessage = securityReminder
            ? `${systemPrompt}\n\n---\n\n${securityReminder}\n\nUser: ${text}`
            : `${systemPrompt}\n\nUser: ${text}`;
        } else {
          // Resumed session: just security reminder (if enabled)
          fullMessage = securityReminder
            ? `${securityReminder}\n\nUser: ${text}`
            : `User: ${text}`;
        }
      }

      // Check if this message is requesting an image
      // Only route to image mode if imageGen is enabled AND user is asking for an image
      const imageGenEnabled = brain.imageGen?.enabled === true;
      const isImageRequest = imageGenEnabled && (
        text.toLowerCase().includes('image') ||
        text.toLowerCase().includes('picture') ||
        text.toLowerCase().includes('photo') ||
        text.toLowerCase().includes('draw') ||
        text.toLowerCase().includes('generate') ||
        text.toLowerCase().includes('create a')
      );

      // Check if TTS is enabled
      // Priority: User preference > Brain default
      const userTtsPreference = this.sessionManager.getTtsPreference(botId, msg.from.id);
      const ttsEnabled = userTtsPreference !== null
        ? userTtsPreference  // Use user preference if set
        : (brain.tts?.enabled === true);  // Otherwise use brain default

      let result;

      if (isImageRequest) {
        // IMAGE MODE: 2-turn conversation (identical to TTS)
        // Turn 1: Get Claude's understanding
        // Turn 2: Call image tool → download image file → send to user

        // Load image generation configuration
        // Brain can specify a profile OR inline config (profile takes precedence)
        let imageConfig;
        if (brain.imageGen.profile) {
          // Load profile (throws if profile doesn't exist)
          try {
            imageConfig = this.imageProfileLoader.load(brain.imageGen.profile);
            console.log(`🎨 Using image profile: ${brain.imageGen.profile}`);
          } catch (err) {
            console.error(`❌ Failed to load image profile: ${err.message}`);
            // Fall back to inline config if profile fails
            imageConfig = {
              model: brain.imageGen.model || 'dall-e-2',
              size: brain.imageGen.size || '256x256',
              quality: brain.imageGen.quality || 'standard',
              style: brain.imageGen.style || 'vivid',
              promptContext: brain.imageGen.promptContext || ''
            };
          }
        } else {
          // Use inline config from brain
          imageConfig = {
            model: brain.imageGen.model || 'dall-e-2',
            size: brain.imageGen.size || '256x256',
            quality: brain.imageGen.quality || 'standard',
            style: brain.imageGen.style || 'vivid',
            promptContext: brain.imageGen.promptContext || ''
          };
        }

        result = await sendToClaudeWithImage({
          message: fullMessage,
          messageContent: messageContent,
          userText: text,  // Pass raw user text for image prompt
          sessionId: currentUuid,
          claudeCmd: this.claudeCmd,
          botId,
          telegramUserId: msg.from.id,
          imageModel: imageConfig.model,
          imageSize: imageConfig.size,
          imageQuality: imageConfig.quality,
          imageStyle: imageConfig.style,
          imagePromptContext: imageConfig.promptContext,
          onTurn2Start: async () => {
            // Update status from "Thinking..." to "Drawing..."
            try {
              await bot.editMessageText('🎨 Drawing...', {
                chat_id: chatId,
                message_id: statusMsg.message_id
              });
            } catch (e) {
              // Ignore edit errors
            }
          }
        });
      } else if (ttsEnabled) {
        // TTS MODE: 2-turn conversation (convert Claude's text response to audio)
        result = await sendToClaudeWithTTS({
          message: fullMessage,
          messageContent: messageContent, // Pass structured content if we have images
          sessionId: currentUuid, // Use UUID for --resume
          claudeCmd: this.claudeCmd,
          ttsVoice: brain.tts.voice || 'nova',
          ttsSpeed: brain.tts.speed || 1.0,
          ttsProvider: brain.tts.provider || null,  // Pass provider from brain config
          botId,
          telegramUserId: msg.from.id,
          onTurn2Start: async () => {
            // Update status from "Thinking..." to "Recording..."
            try {
              await bot.editMessageText('🎙️ Recording...', {
                chat_id: chatId,
                message_id: statusMsg.message_id
              });
            } catch (e) {
              // Ignore edit errors
            }
          }
        });
      } else {
        // TEXT MODE: Streaming enabled (Claude may call image tools during response)
        let streamedText = '';
        let lastUpdate = Date.now();
        let generatedImages = []; // Track images generated during response

        const onStream = async (chunk) => {
          streamedText += chunk;

          // Throttle updates to avoid rate limits (max 1 per second)
          const now = Date.now();
          if (now - lastUpdate > 1000) {
            lastUpdate = now;
            try {
              const preview = streamedText.length > 400
                ? streamedText.substring(0, 400) + '...'
                : streamedText;

              await bot.editMessageText(preview, {
                chat_id: chatId,
                message_id: statusMsg.message_id
              });
            } catch (e) {
              // Ignore edit errors (message might be too old or identical)
            }
          }
        };

        result = await sendToClaudeSession({
          message: fullMessage,
          messageContent: messageContent, // Pass structured content if we have images
          sessionId: currentUuid, // Use UUID for --resume (null for new sessions)
          claudeCmd: this.claudeCmd,
          onStream,
          onToolResult: (toolName, toolResult) => {
            // Watch for image generation tool calls
            if (toolName === 'mcp__image-gen__generate_image') {
              try {
                const imageData = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
                if (imageData.success && imageData.image_path) {
                  console.log(`🖼️  [${botId}] Image generated: ${imageData.image_path}`);
                  generatedImages.push(imageData.image_path);
                }
              } catch (e) {
                console.error(`⚠️  Failed to parse image result:`, e.message);
              }
            }
          }
        });

        // Attach generated images to result
        result.generatedImages = generatedImages;
      }

      // Capture and store the UUID from Claude's response
      if (result.success && result.metadata?.sessionInfo?.sessionId) {
        const claudeUuid = result.metadata.sessionInfo.sessionId;
        this.sessionManager.setCurrentUuid(botId, msg.from.id, claudeUuid);
        console.log(`💾 [${botId}] Saved UUID ${claudeUuid.substring(0, 8)}... for user ${msg.from.id}`);
      }

      // Increment message count
      this.sessionManager.incrementMessageCount(botId, msg.from.id);

      // Increment rate limit counter
      this.rateLimiter.increment(botId, msg.from.id);

      // Update last message time (for nudge system)
      this.sessionManager.updateLastMessageTime(botId, msg.from.id);

      // Mark last nudge as responded (if there was one)
      const metadata = this.sessionManager.loadSessionMetadata(botId, msg.from.id);
      if (metadata?.nudgeHistory?.length > 0) {
        const lastNudge = metadata.nudgeHistory[metadata.nudgeHistory.length - 1];
        if (!lastNudge.userResponded) {
          this.sessionManager.markNudgeResponded(botId, msg.from.id, lastNudge.timestamp);
        }
      }

      // Delete thinking message
      try {
        await bot.deleteMessage(chatId, statusMsg.message_id);
      } catch (e) {
        // Ignore delete errors
      }

      // Send final response
      console.log(`🐛 [${botId}] Result:`, JSON.stringify({success: result.success, hasText: !!result.text, hasImagePath: !!result.imagePath, hasAudioPath: !!result.audioPath}, null, 2));
      // Accept result if: success AND (has text OR has image OR has audio)
      if (result.success && (result.text || result.imagePath || result.audioPath)) {
        let cleanResponse = result.text || '';

        // Clean up response (remove system prompt echo if present)
        if (cleanResponse && cleanResponse.includes('User:')) {
          // Sometimes Claude echoes the prompt, remove it
          const userIndex = cleanResponse.lastIndexOf('User:');
          if (userIndex > 0) {
            cleanResponse = cleanResponse.substring(userIndex + 5).trim();
          }
        }

        // Check if audio was generated
        const hasAudio = result.audioPath && result.audioPath !== null;
        const sendTextTooAudio = brain.tts?.sendTextToo === true; // Default to false (audio only)

        // Check if images were generated
        // - 2-turn flow: result.imagePath (single image from sendToClaudeWithImage)
        // - 1-turn flow: result.generatedImages (array from tool monitoring)
        const hasImageFrom2Turn = result.imagePath && result.imagePath !== null;
        const hasImagesFrom1Turn = result.generatedImages && result.generatedImages.length > 0;
        const hasImages = hasImageFrom2Turn || hasImagesFrom1Turn;
        const sendTextTooImage = brain.imageGen?.sendTextToo === true; // Default to false (image only)

        // Send audio if available
        if (hasAudio) {
          try {
            await bot.sendVoice(chatId, result.audioPath);
            console.log(`✅ [${botId}] Voice message sent: ${result.audioPath}`);
          } catch (audioError) {
            console.error(`❌ [${botId}] Failed to send audio:`, audioError.message);
            // Fall back to text if audio fails
            await bot.sendMessage(chatId, cleanResponse);
          }
        }

        // Send images if available
        if (hasImages) {
          // 2-turn flow: single image
          if (hasImageFrom2Turn) {
            try {
              await bot.sendPhoto(chatId, result.imagePath);
              console.log(`✅ [${botId}] Image sent (2-turn): ${result.imagePath}`);
            } catch (imageError) {
              console.error(`❌ [${botId}] Failed to send image:`, imageError.message);
            }
          }

          // 1-turn flow: multiple images (if any)
          if (hasImagesFrom1Turn) {
            for (const imagePath of result.generatedImages) {
              try {
                await bot.sendPhoto(chatId, imagePath);
                console.log(`✅ [${botId}] Image sent (1-turn): ${imagePath}`);
              } catch (imageError) {
                console.error(`❌ [${botId}] Failed to send image:`, imageError.message);
              }
            }
          }
        }

        // Send text version ONLY if:
        // - No audio/image was generated (text mode) OR
        // - Audio was generated but sendTextToo is true OR
        // - Image was generated but sendTextToo is true
        const shouldSendText = (!hasAudio && !hasImages) ||
                               (hasAudio && sendTextTooAudio) ||
                               (hasImages && sendTextTooImage);

        if (shouldSendText) {
          // Split into chunks if needed (Telegram limit: 4096 chars)
          const MAX_LENGTH = 4000;
          if (cleanResponse.length <= MAX_LENGTH) {
            await bot.sendMessage(chatId, cleanResponse);
          } else {
            // Send in chunks
            for (let i = 0; i < cleanResponse.length; i += MAX_LENGTH) {
              const chunk = cleanResponse.substring(i, i + MAX_LENGTH);
              await bot.sendMessage(chatId, chunk);
            }
          }
        }

        // Log response
        let responseType;
        if (hasAudio && sendTextTooAudio) {
          responseType = '(voice + text)';
        } else if (hasAudio) {
          responseType = '(voice only)';
        } else if (hasImages && sendTextTooImage) {
          const imageCount = hasImagesFrom1Turn ? result.generatedImages.length : 1;
          responseType = `(${imageCount} image(s) + text)`;
        } else if (hasImages) {
          const imageCount = hasImagesFrom1Turn ? result.generatedImages.length : 1;
          responseType = `(${imageCount} image(s) only)`;
        } else {
          responseType = '(text only)';
        }
        console.log(`✅ [${botId}] Response sent ${responseType} (${cleanResponse.length} chars)`);

        // Check if we should send a Call-to-Action message
        if (brain.callToAction?.enabled) {
          const metadata = this.sessionManager.loadSessionMetadata(botId, msg.from.id);
          const triggerEvery = brain.callToAction.triggerEvery || 5;
          const sendOnFirst = brain.callToAction.sendOnFirstMessage === true;

          // Send CTA if:
          // 1. It's the first message AND sendOnFirstMessage is true, OR
          // 2. Message count is a multiple of triggerEvery
          const shouldSendCTA = metadata && (
            (sendOnFirst && metadata.messageCount === 1) ||
            (metadata.messageCount % triggerEvery === 0)
          );

          if (shouldSendCTA) {
            // Get delay in seconds (default to 0 for immediate send)
            const delaySeconds = brain.callToAction.delaySeconds || 0;
            const delayMs = delaySeconds * 1000;

            // Send CTA after delay
            setTimeout(async () => {
              try {
                if (brain.callToAction.image) {
                  // Send photo with caption
                  const imagePath = require('path').join(process.cwd(), brain.callToAction.image);
                  await bot.sendPhoto(chatId, imagePath, {
                    caption: brain.callToAction.message
                  });
                  console.log(`📢 [${botId}] CTA sent (with image) to user ${msg.from.id} (message #${metadata.messageCount}) after ${delaySeconds}s delay`);
                } else {
                  // Send text message with link preview
                  await bot.sendMessage(chatId, brain.callToAction.message, {
                    disable_web_page_preview: false
                  });
                  console.log(`📢 [${botId}] CTA sent to user ${msg.from.id} (message #${metadata.messageCount}) after ${delaySeconds}s delay`);
                }
              } catch (ctaError) {
                console.error(`❌ [${botId}] Failed to send CTA:`, ctaError.message);
              }
            }, delayMs);

            if (delaySeconds > 0) {
              console.log(`⏰ [${botId}] CTA scheduled for user ${msg.from.id} in ${delaySeconds} seconds`);
            }
          }
        }
      } else {
        // Error from Claude
        await bot.sendMessage(chatId, `❌ Sorry, I encountered an error: ${result.error || 'Unknown error'}`);
        console.error(`❌ [${botId}] Claude error:`, result.error);
      }
    } catch (error) {
      console.error(`❌ [${botId}] Error handling message:`, error);
      try {
        await bot.sendMessage(chatId, `❌ Sorry, something went wrong: ${error.message}`);
      } catch (e) {
        // Failed to send error message
      }
    }
  }

  /**
   * Handle bot commands
   *
   * @param {string} botId - Bot identifier
   * @param {Object} msg - Telegram message object
   */
  async handleCommand(botId, msg) {
    const chatId = msg.chat.id;
    const command = msg.text.split(' ')[0].toLowerCase();

    const botInfo = this.bots.get(botId);
    if (!botInfo) return;

    const { bot, brain } = botInfo;

    switch (command) {
      case '/start':
      case '/help':
        let helpText = `👋 Hi! I'm ${brain.name || 'a bot'}.

${brain.description || 'I\'m here to chat!'}

Just send me a message and I'll respond.

Commands:
/help - Show this help message
/tts - Toggle voice/text mode
/stats - Show conversation stats`;

        // Add /restart command for CartoonGen only
        if (botId === 'cartooned') {
          helpText += `\n/restart - Start fresh conversation`;
        }

        await bot.sendMessage(chatId, helpText);
        break;

      case '/reset':
        // INTERNAL: Silent reset - clears UUID but keeps tracking
        // Moves current UUID to history, next message starts fresh Claude conversation
        this.sessionManager.resetConversation(botId, msg.from.id);
        // No user notification - happens silently
        console.log(`🔄 [${botId}] Conversation reset for user ${msg.from.id} (silent)`);
        break;

      case '/restart':
        // USER-FACING: Reset conversation with confirmation
        // Only available for CartoonGen bot
        if (botId === 'cartooned') {
          this.sessionManager.resetConversation(botId, msg.from.id);
          await bot.sendMessage(chatId, '🔄 Conversation restarted!');
          console.log(`🔄 [${botId}] Conversation restarted for user ${msg.from.id}`);
        } else {
          await bot.sendMessage(chatId, '❓ This command is not available for this bot. Try /help');
        }
        break;

      case '/tts':
        // Toggle TTS on/off for this user
        const currentTtsPref = this.sessionManager.getTtsPreference(botId, msg.from.id);
        const brainDefault = brain.tts?.enabled === true;

        // If no preference set, use opposite of brain default
        // If preference is set, toggle it
        const currentState = currentTtsPref !== null ? currentTtsPref : brainDefault;
        const newState = !currentState;

        this.sessionManager.setTtsPreference(botId, msg.from.id, newState);

        const confirmationMsg = newState
          ? '🎙️ Speech Mode Activated'
          : '💬 Text Mode Activated';

        await bot.sendMessage(chatId, confirmationMsg);
        console.log(`🔊 [${botId}] TTS toggled for user ${msg.from.id}: ${currentState} → ${newState}`);
        break;

      case '/stats':
        // Show session metadata
        const metadata = this.sessionManager.loadSessionMetadata(botId, msg.from.id);
        if (metadata) {
          const statsText = `📊 **Conversation Stats**

Messages: ${metadata.messageCount}
Started: ${metadata.created.toLocaleDateString()}
Last message: ${metadata.modified.toLocaleString()}
Session size: ${(metadata.sizeBytes / 1024).toFixed(1)} KB`;

          await bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
        } else {
          await bot.sendMessage(chatId, '📊 No conversation history yet. Send a message to start!');
        }
        break;

      default:
        // Unknown command
        await bot.sendMessage(chatId, `❓ Unknown command. Try /help for available commands.`);
    }
  }

  /**
   * Start all bots
   *
   * This is called after all bots have been added.
   */
  startAll() {
    console.log(`\n🤖 Bot Platform Running`);
    console.log(`📊 Active bots: ${this.bots.size}`);

    // List all bots
    for (const [id, { brain }] of this.bots) {
      console.log(`   - ${brain.name || id} (brain: ${brain.version || '1.0'})`);
    }

    console.log(`\n✨ Ready to receive messages!\n`);
  }

  /**
   * Stop all bots
   *
   * Gracefully shut down all Telegram bot instances.
   */
  async stopAll() {
    logger.info('Shutting down bots...');

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    for (const [id, { bot }] of this.bots) {
      try {
        await bot.stopPolling();
        logger.bot(id, 'info', 'Bot stopped');
      } catch (error) {
        logger.bot(id, 'error', 'Error stopping bot', { error: error.message });
      }
    }

    this.bots.clear();
    logger.info('All bots stopped');
  }

  /**
   * Get bot by ID
   *
   * @param {string} botId - Bot identifier
   * @returns {Object|null} Bot info or null if not found
   */
  getBot(botId) {
    return this.bots.get(botId) || null;
  }

  /**
   * List all active bots
   *
   * @returns {Array<Object>} Array of bot info objects
   */
  listBots() {
    return Array.from(this.bots.entries()).map(([id, info]) => ({
      id,
      name: info.brain.name,
      version: info.brain.version,
      description: info.brain.description
    }));
  }

  /**
   * Perform health checks on all bots
   */
  performHealthChecks() {
    const now = new Date();

    for (const [id, botInfo] of this.bots) {
      try {
        const { bot, status, lastHealthCheck, messageCount, errorCount } = botInfo;

        // Check if bot is still responsive
        const isHealthy = bot.isPolling();

        // Update status
        if (isHealthy && status !== 'healthy') {
          logger.bot(id, 'info', 'Bot recovered', { messageCount, errorCount });
          botInfo.status = 'healthy';
          botInfo.errorCount = 0;
        } else if (!isHealthy && status !== 'unhealthy') {
          logger.bot(id, 'warn', 'Bot unhealthy - not polling', { lastHealthCheck });
          botInfo.status = 'unhealthy';

          // Attempt recovery
          this.recoverBot(id);
        }

        botInfo.lastHealthCheck = now;

      } catch (error) {
        logger.bot(id, 'error', 'Health check failed', { error: error.message });
        botInfo.errorCount++;

        // If too many errors, attempt recovery
        if (botInfo.errorCount >= 3) {
          this.recoverBot(id);
        }
      }
    }
  }

  /**
   * Attempt to recover a bot
   */
  async recoverBot(id) {
    logger.bot(id, 'warn', 'Attempting bot recovery...');

    const botInfo = this.bots.get(id);
    if (!botInfo) return;

    const { bot, config } = botInfo;

    try {
      // Stop polling
      await bot.stopPolling();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Recreate bot instance
      const newBot = new TelegramBot(config.token, { polling: true });

      // Set up handlers
      newBot.on('message', (msg) => this.handleMessage(id, msg));
      newBot.on('polling_error', (error) => {
        logger.bot(id, 'error', 'Polling error', { error: error.message });
        this.handleBotError(id, error);
      });

      // Update bot info
      botInfo.bot = newBot;
      botInfo.status = 'healthy';
      botInfo.errorCount = 0;
      botInfo.lastHealthCheck = new Date();

      logger.bot(id, 'info', 'Bot recovered successfully');

    } catch (error) {
      logger.bot(id, 'error', 'Bot recovery failed', { error: error.message });
      botInfo.status = 'failed';
    }
  }

  /**
   * Handle bot errors
   */
  handleBotError(id, error) {
    const botInfo = this.bots.get(id);
    if (!botInfo) return;

    botInfo.errorCount++;

    // If too many errors, mark as unhealthy
    if (botInfo.errorCount >= 5) {
      botInfo.status = 'unhealthy';
      logger.bot(id, 'error', 'Bot marked unhealthy - too many errors', {
        errorCount: botInfo.errorCount
      });
    }
  }
}

module.exports = BotManager;
