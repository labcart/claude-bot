#!/usr/bin/env node

/**
 * Claude Bot Platform - Main Server
 *
 * Multi-bot Telegram platform powered by Claude Code CLI.
 * Each bot has its own personality defined in brain files.
 *
 * Usage:
 *   node server.js
 *   npm start
 *   npm run dev (with nodemon)
 */

require('dotenv').config();
const BotManager = require('./lib/bot-manager');
const NudgeManager = require('./lib/nudge-manager');
const TerminalManager = require('./lib/terminal-manager');
const { recoverFromRestart } = require('./lib/restart-recovery');
const fs = require('fs');
const path = require('path');

// Clear Node.js require cache for all brain files to ensure fresh loads
const brainsDir = path.join(__dirname, 'brains');
if (fs.existsSync(brainsDir)) {
  const brainFiles = fs.readdirSync(brainsDir).filter(f => f.endsWith('.js'));
  let cleared = 0;
  brainFiles.forEach(file => {
    const brainPath = path.join(brainsDir, file);
    try {
      const resolvedPath = require.resolve(brainPath);
      if (require.cache[resolvedPath]) {
        delete require.cache[resolvedPath];
        cleared++;
      }
    } catch (err) {
      // Brain not in cache yet, that's fine
    }
  });
  if (cleared > 0) {
    console.log(`🔄 Cleared require cache for ${cleared} brain files`);
  }
}

// ASCII art banner
console.log(`
╔═══════════════════════════════════════╗
║   🤖 Claude Bot Platform v1.0         ║
║   Multi-Bot Telegram Manager          ║
╚═══════════════════════════════════════╝
`);

// Load bot configurations from bots.json
const botsConfigPath = path.join(__dirname, 'bots.json');

if (!fs.existsSync(botsConfigPath)) {
  console.error('❌ Error: bots.json file not found');
  console.error('   Please create a bots.json file with bot configurations');
  console.error('   See bots.json.example for template\n');
  process.exit(1);
}

// Parse bot configurations
let bots;
try {
  const botsConfigData = fs.readFileSync(botsConfigPath, 'utf8');
  bots = JSON.parse(botsConfigData);
} catch (error) {
  console.error('❌ Error: Invalid JSON in bots.json file');
  console.error('   Make sure bots.json is valid JSON array\n');
  console.error('   Error:', error.message, '\n');
  process.exit(1);
}

if (!Array.isArray(bots) || bots.length === 0) {
  console.error('❌ Error: bots.json must contain a non-empty array');
  console.error('   Add at least one bot configuration\n');
  process.exit(1);
}

// Validate each bot config
for (const bot of bots) {
  // Web-only bots don't need tokens
  if (!bot.id || !bot.brain || (!bot.token && !bot.webOnly)) {
    console.error('❌ Error: Each bot must have id and brain fields (token required unless webOnly)');
    console.error('   Invalid bot config:', JSON.stringify(bot, null, 2));
    process.exit(1);
  }
}

// Create bot manager
const manager = new BotManager({
  claudeCmd: process.env.CLAUDE_CMD || 'claude'
});

// Create terminal manager
const terminalManager = new TerminalManager();

// Initialize bots asynchronously
(async () => {
  // Add each bot
  console.log('🚀 Loading bots...\n');

  for (const bot of bots) {
    try {
      await manager.addBot(bot);
    } catch (error) {
      console.error(`❌ Failed to load bot ${bot.id}:`, error.message);
      console.error('   Skipping this bot...\n');
    }
  }

  // Check if any bots were successfully loaded
  if (manager.bots.size === 0) {
    console.error('❌ No bots were successfully loaded');
    console.error('   Check your bot configurations and try again\n');
    process.exit(1);
  }

  // Start all bots
  manager.startAll();

  // Recover from previous server restart (cleanup orphaned requests)
  recoverFromRestart(manager).catch(err => {
    console.error('⚠️  Restart recovery failed:', err.message);
  });
})();

// Initialize Nudge Manager
const nudgeManager = new NudgeManager(
  manager,
  manager.sessionManager,
  process.env.CLAUDE_CMD || 'claude'
);

// Start HTTP server for external delegation requests
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();

// CORS middleware for HTTP requests (fetch API calls from browser)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const HTTP_PORT = process.env.BOT_SERVER_PORT || 3010;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Response queue for bot callbacks
// Key: requestId, Value: { response, timestamp, resolved }
const responseQueue = new Map();

// Track which terminals belong to which socket for cleanup
// Key: socketId, Value: Set of terminalIds
const socketTerminals = new Map();

// Helper to generate unique request IDs
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// POST /trigger-bot - Receive delegation from external sessions (VSCode, etc)
app.post('/trigger-bot', async (req, res) => {
  const { targetBot, task, messages, userId, waitForResponse, responseFormat } = req.body;

  // Validate admin user
  if (!ADMIN_USER_ID || String(userId) !== String(ADMIN_USER_ID)) {
    return res.status(403).json({ error: 'Unauthorized - admin only' });
  }

  // Validate request
  if (!targetBot || !task || !Array.isArray(messages)) {
    return res.status(400).json({
      error: 'Invalid request',
      required: { targetBot: 'string', task: 'string', messages: 'array', userId: 'number' }
    });
  }

  try {
    // Generate request ID if waiting for response
    const requestId = waitForResponse ? generateRequestId() : null;

    // Use the existing delegation logic from bot-manager
    await manager.delegateToBot(
      'external', // source bot (not a real bot, just for logging)
      targetBot,
      parseInt(userId),
      task,
      messages,
      requestId,
      responseFormat
    );

    const response = {
      success: true,
      targetBot,
      messageCount: messages.length,
      message: `Context delegated to ${targetBot}`
    };

    if (requestId) {
      response.requestId = requestId;
      response.waitingForResponse = true;
      response.pollUrl = `/response/${requestId}`;
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Trigger-bot endpoint error:', error);
    res.status(500).json({
      error: 'Delegation failed',
      details: error.message
    });
  }
});

// POST /callback/:requestId - Receive response from bot
app.post('/callback/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const { response, reasoning } = req.body;

  console.log(`📥 Received callback for request ${requestId}:`, { response, reasoning });

  // Store the response
  responseQueue.set(requestId, {
    response,
    reasoning,
    timestamp: Date.now(),
    resolved: true
  });

  res.json({ success: true, message: 'Response received' });
});

// GET /response/:requestId - Poll for response (used by MCP tool)
app.get('/response/:requestId', (req, res) => {
  const { requestId } = req.params;
  const result = responseQueue.get(requestId);

  if (!result) {
    return res.status(404).json({
      waiting: true,
      message: 'No response yet'
    });
  }

  if (result.resolved) {
    // Clean up after retrieval
    responseQueue.delete(requestId);
    return res.json({
      waiting: false,
      response: result.response,
      reasoning: result.reasoning,
      timestamp: result.timestamp
    });
  }

  res.status(404).json({
    waiting: true,
    message: 'Response not ready'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bots: Array.from(manager.bots.keys()),
    uptime: process.uptime(),
    pendingResponses: responseQueue.size
  });
});

// GET /sessions/:botId/:userId - Get session history for a bot+user
app.get('/sessions/:botId/:userId', (req, res) => {
  const { botId, userId } = req.params;
  const { workspace } = req.query; // Optional workspace filter

  try {
    // Load current session metadata
    const metadata = manager.sessionManager.loadSessionMetadata(botId, parseInt(userId));

    if (!metadata) {
      return res.json({
        currentSession: null,
        history: []
      });
    }

    // If workspace filter is provided, check if this session matches
    if (workspace && metadata.workspacePath && metadata.workspacePath !== workspace) {
      // Session is from a different workspace, return empty
      return res.json({
        currentSession: null,
        history: []
      });
    }

    // Build current session info (only if it matches workspace filter or no filter)
    const currentSession = metadata.currentUuid ? {
      uuid: metadata.currentUuid,
      botId: botId,
      userId: parseInt(userId),
      messageCount: metadata.messageCount || 0,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      isCurrent: true,
      workspacePath: metadata.workspacePath || null
    } : null;

    // Build history from uuidHistory
    const history = (metadata.uuidHistory || []).map(entry => ({
      uuid: entry.uuid,
      botId: botId,
      userId: parseInt(userId),
      createdAt: entry.createdAt || entry.startedAt,
      endedAt: entry.endedAt || entry.resetAt || entry.rotatedAt,
      messageCount: entry.messageCount || 0,
      reason: entry.reason || (entry.resetAt ? 'reset' : 'rotation'),
      isCurrent: false
    })).reverse(); // Most recent first

    res.json({
      currentSession,
      history,
      totalSessions: history.length + (currentSession ? 1 : 0)
    });
  } catch (error) {
    console.error('❌ Error fetching sessions:', error);
    res.status(500).json({
      error: 'Failed to fetch sessions',
      details: error.message
    });
  }
});

// POST /switch-session - Load a specific session
app.post('/switch-session', (req, res) => {
  const { botId, userId, sessionUuid } = req.body;

  if (!botId || !userId || !sessionUuid) {
    return res.status(400).json({
      error: 'Invalid request',
      required: { botId: 'string', userId: 'number', sessionUuid: 'string' }
    });
  }

  try {
    const metadata = manager.sessionManager.loadSessionMetadata(botId, parseInt(userId));

    if (!metadata) {
      return res.status(404).json({ error: 'No session found for this user' });
    }

    // Check if the UUID is in history
    const historyEntry = (metadata.uuidHistory || []).find(entry => entry.uuid === sessionUuid);

    if (!historyEntry && metadata.currentUuid !== sessionUuid) {
      return res.status(404).json({ error: 'Session UUID not found' });
    }

    // If switching to a historical session, move current to history and restore the old one
    if (metadata.currentUuid && metadata.currentUuid !== sessionUuid) {
      // Archive current session
      metadata.uuidHistory = metadata.uuidHistory || [];
      metadata.uuidHistory.push({
        uuid: metadata.currentUuid,
        createdAt: metadata.createdAt, // Preserve creation timestamp
        switchedAwayAt: new Date().toISOString(),
        messageCount: metadata.messageCount
      });
    }

    // Set the requested UUID as current
    metadata.currentUuid = sessionUuid;

    // If switching to a history entry, restore its timestamps and messageCount
    if (historyEntry) {
      metadata.createdAt = historyEntry.createdAt || new Date().toISOString();
      metadata.messageCount = historyEntry.messageCount || 0;
      // Restore updatedAt from history entry if it exists, otherwise use current time
      if (historyEntry.switchedAwayAt || historyEntry.resetAt || historyEntry.rotatedAt) {
        metadata.updatedAt = historyEntry.switchedAwayAt || historyEntry.resetAt || historyEntry.rotatedAt;
      }
    } else {
      // New session - reset timestamps and messageCount
      metadata.createdAt = new Date().toISOString();
      metadata.messageCount = 0;
      metadata.updatedAt = new Date().toISOString();
    }

    // Remove from history if it was there
    if (historyEntry) {
      metadata.uuidHistory = metadata.uuidHistory.filter(e => e.uuid !== sessionUuid);
    }

    manager.sessionManager.saveSessionMetadata(botId, parseInt(userId), metadata);

    res.json({
      success: true,
      currentSession: sessionUuid,
      message: 'Session switched successfully'
    });
  } catch (error) {
    console.error('❌ Error switching session:', error);
    res.status(500).json({
      error: 'Failed to switch session',
      details: error.message
    });
  }
});

// POST /new-session - Create a new session
app.post('/new-session', (req, res) => {
  const { botId, userId } = req.body;

  if (!botId || !userId) {
    return res.status(400).json({
      error: 'Invalid request',
      required: { botId: 'string', userId: 'number' }
    });
  }

  try {
    const success = manager.sessionManager.resetConversation(botId, parseInt(userId));

    if (!success) {
      // No existing session - that's fine, next message will create one
      return res.json({
        success: true,
        message: 'Ready to start new session on next message'
      });
    }

    res.json({
      success: true,
      message: 'New session created - previous session archived'
    });
  } catch (error) {
    console.error('❌ Error creating new session:', error);
    res.status(500).json({
      error: 'Failed to create new session',
      details: error.message
    });
  }
});

// GET /all-sessions - List all session files from Claude projects folder
app.get('/all-sessions', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  try {
    // Get workspace from query params (e.g., /all-sessions?workspace=/opt/lab)
    const workspacePath = req.query.workspace || '/opt/lab/claude-bot';

    // Convert workspace path to Claude projects directory name
    // Example: /opt/lab -> -opt-lab
    const dirName = workspacePath.replace(/\//g, '-');
    const sessionsDir = path.join(os.homedir(), '.claude/projects', dirName);

    if (!fs.existsSync(sessionsDir)) {
      return res.json({ sessions: [] });
    }

    const files = fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .map(f => {
        const filePath = path.join(sessionsDir, f);
        const stats = fs.statSync(filePath);
        const uuid = f.replace('.jsonl', '');

        // Count messages by reading file
        let messageCount = 0;
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.trim().split('\n').filter(line => line.trim());
          for (const line of lines) {
            const entry = JSON.parse(line);
            if (entry.type === 'user' || entry.type === 'assistant') {
              messageCount++;
            }
          }
        } catch (err) {
          // Skip count if error
        }

        return {
          uuid,
          messageCount,
          updatedAt: stats.mtime.toISOString(),
          createdAt: stats.birthtime.toISOString(),
          size: stats.size
        };
      })
      .filter(s => s.size > 0) // Only non-empty sessions
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json({
      sessions: files,
      totalSessions: files.length
    });
  } catch (error) {
    console.error('❌ Error listing sessions:', error);
    res.status(500).json({
      error: 'Failed to list sessions',
      details: error.message
    });
  }
});

// GET /messages/:sessionUuid - Get messages from a session file
app.get('/messages/:sessionUuid', (req, res) => {
  const { sessionUuid } = req.params;
  let workspacePath = req.query.workspace;

  // If workspace not provided, try to find it from session metadata
  if (!workspacePath) {
    const botId = req.query.botId;
    const userId = req.query.userId;

    if (botId && userId) {
      const metadata = manager.sessionManager.loadSessionMetadata(botId, parseInt(userId));
      if (metadata && metadata.workspacePath) {
        workspacePath = metadata.workspacePath;
        console.log(`📍 Using workspace from session metadata: ${workspacePath}`);
      }
    }
  }

  // Don't set fallback here - let readSessionMessages auto-search across workspaces
  // workspacePath will be null if not found, which triggers auto-search

  try {
    const messages = manager.readSessionMessages(sessionUuid, 1000, workspacePath);

    // Transform to frontend format
    const formattedMessages = messages.map((msg, index) => ({
      id: `${msg.role}-${index}`,
      text: msg.text,
      sender: msg.role === 'user' ? 'user' : 'bot',
      timestamp: Date.now() - (messages.length - index) * 1000, // Rough timestamps for ordering
      role: msg.role
    }));

    res.json({
      sessionUuid,
      messages: formattedMessages,
      messageCount: formattedMessages.length
    });
  } catch (error) {
    console.error('❌ Error reading session messages:', error);
    res.status(500).json({
      error: 'Failed to read session messages',
      details: error.message
    });
  }
});

// WebSocket connection handling for UI
io.on('connection', (socket) => {
  console.log(`🔌 UI client connected: ${socket.id}`);

  // Handle incoming messages from UI
  socket.on('send-message', async (data) => {
    const { botId, userId, message, workspacePath } = data;
    console.log(`📨 Message from UI for bot ${botId} (workspace: ${workspacePath}):`, message);

    try {
      const botInfo = manager.bots.get(botId);
      if (!botInfo) {
        socket.emit('error', { message: `Bot ${botId} not found` });
        return;
      }

      // Get or create session for this bot + UI user
      const currentUuid = manager.sessionManager.getCurrentUuid(botId, userId);
      const isNewSession = !currentUuid;

      if (isNewSession) {
        console.log(`🆕 [${botId}] New UI session for user ${userId}`);
      } else {
        console.log(`📝 [${botId}] Resuming UI session ${currentUuid.substring(0, 8)}... for user ${userId}`);
      }

      // Build system prompt for new sessions
      const brain = botInfo.brain;
      let fullMessage;

      if (isNewSession) {
        // New session: include system prompt from brain
        const systemPrompt = await manager.brainLoader.buildSystemPrompt(
          botInfo.config.brain,
          { id: userId, username: 'ui_user' } // Mock user object for UI
        );
        const securityReminder = await manager.brainLoader.getSecurityReminder(botInfo.config.brain);

        // Debug: Log first 300 chars of system prompt
        console.log(`🧠 [${botId}] System prompt preview: ${systemPrompt.substring(0, 300)}...`);

        // Wrap user text in delimiters so we can extract it when reading logs
        fullMessage = securityReminder
          ? `${systemPrompt}\n\n---\n\n${securityReminder}\n\n<<<USER_TEXT_START>>>${message}<<<USER_TEXT_END>>>`
          : `${systemPrompt}\n\n<<<USER_TEXT_START>>>${message}<<<USER_TEXT_END>>>`;
      } else {
        // Resumed session: just security reminder (if enabled)
        const securityReminder = await manager.brainLoader.getSecurityReminder(botInfo.config.brain);

        // Wrap user text in delimiters so we can extract it when reading logs
        fullMessage = securityReminder
          ? `${securityReminder}\n\n<<<USER_TEXT_START>>>${message}<<<USER_TEXT_END>>>`
          : `<<<USER_TEXT_START>>>${message}<<<USER_TEXT_END>>>`;
      }

      // Send to Claude directly (bypass Telegram)
      const { sendToClaudeSession } = require('./lib/claude-client');

      socket.emit('bot-thinking', { botId });

      const result = await sendToClaudeSession({
        message: fullMessage,
        sessionId: currentUuid,
        claudeCmd: manager.claudeCmd,
        workspacePath: workspacePath || process.env.LABCART_WORKSPACE || process.cwd() // Dynamic workspace
      });

      // Save the session UUID (just like Telegram does)
      const sessionUuid = result.metadata?.sessionInfo?.sessionId;
      if (sessionUuid) {
        const workspace = workspacePath || process.env.LABCART_WORKSPACE || process.cwd();
        manager.sessionManager.setCurrentUuid(botId, userId, sessionUuid, workspace);
        console.log(`💾 [${botId}] Saved UUID ${sessionUuid.substring(0, 8)}... for UI user ${userId} (workspace: ${workspace})`);
      }

      // Update session manager (count both user message + bot response = 2)
      manager.sessionManager.incrementMessageCount(botId, userId);
      manager.sessionManager.incrementMessageCount(botId, userId);

      if (result.success && result.text) {
        // Send response back to UI (include sessionUuid so frontend can update tab)
        socket.emit('bot-message', {
          botId,
          userId,
          message: result.text,
          sessionUuid: sessionUuid || null,
          hasAudio: false,  // REQUIRED by frontend BotMessage interface
          hasImages: false, // REQUIRED by frontend BotMessage interface
          timestamp: Date.now()
        });

        console.log(`✅ [${botId}] Response sent to UI (${result.text.length} chars)`);
      } else {
        socket.emit('error', { message: 'Bot returned no response' });
      }
    } catch (error) {
      console.error('❌ Error handling UI message:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Terminal handlers
  socket.on('terminal:create', (data) => {
    const { terminalId, cwd, cols, rows, botId } = data;
    console.log(`🖥️  Create terminal request: ${terminalId}`);

    try {
      // If terminal already exists, kill it first (handles refresh/remount)
      const existing = terminalManager.get(terminalId);
      if (existing) {
        console.log(`🔄 Terminal ${terminalId} already exists, killing and recreating...`);
        terminalManager.kill(terminalId);
      }

      const terminal = terminalManager.create(terminalId, {
        cwd: cwd || process.cwd(),
        cols: cols || 80,
        rows: rows || 30,
        botId
      });

      // Track this terminal for this socket
      if (!socketTerminals.has(socket.id)) {
        socketTerminals.set(socket.id, new Set());
      }
      socketTerminals.get(socket.id).add(terminalId);

      // Attach data listener to stream output to client
      const terminalObj = terminalManager.get(terminalId);
      if (terminalObj) {
        terminalObj.ptyProcess.onData((data) => {
          socket.emit('terminal:output', { terminalId, data });
        });

        terminalObj.ptyProcess.onExit(({ exitCode, signal }) => {
          console.log(`🖥️  Terminal ${terminalId} exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`);
          socket.emit('terminal:exit', { terminalId, exitCode, signal });
          terminalManager.kill(terminalId);
        });
      }

      socket.emit('terminal:created', { terminalId, ...terminal });
    } catch (error) {
      console.error(`❌ Error creating terminal ${terminalId}:`, error);
      socket.emit('terminal:error', { terminalId, error: error.message });
    }
  });

  socket.on('terminal:input', (data) => {
    const { terminalId, data: inputData } = data;
    try {
      terminalManager.write(terminalId, inputData);
    } catch (error) {
      console.error(`❌ Error writing to terminal ${terminalId}:`, error);
      socket.emit('terminal:error', { terminalId, error: error.message });
    }
  });

  socket.on('terminal:resize', (data) => {
    const { terminalId, cols, rows } = data;
    try {
      terminalManager.resize(terminalId, cols, rows);
    } catch (error) {
      console.error(`❌ Error resizing terminal ${terminalId}:`, error);
      socket.emit('terminal:error', { terminalId, error: error.message });
    }
  });

  socket.on('terminal:kill', (data) => {
    const { terminalId } = data;
    try {
      terminalManager.kill(terminalId);

      // Remove from tracking
      const terminals = socketTerminals.get(socket.id);
      if (terminals) {
        terminals.delete(terminalId);
      }

      socket.emit('terminal:killed', { terminalId });
    } catch (error) {
      console.error(`❌ Error killing terminal ${terminalId}:`, error);
      socket.emit('terminal:error', { terminalId, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 UI client disconnected: ${socket.id}`);

    // Clean up terminals associated with this socket
    const terminals = socketTerminals.get(socket.id);
    if (terminals && terminals.size > 0) {
      console.log(`🧹 Cleaning up ${terminals.size} terminal(s) for socket ${socket.id}`);
      for (const terminalId of terminals) {
        try {
          terminalManager.kill(terminalId);
          console.log(`  ✓ Killed terminal ${terminalId}`);
        } catch (error) {
          console.error(`  ❌ Error killing terminal ${terminalId}:`, error.message);
        }
      }
      socketTerminals.delete(socket.id);
    }
  });
});

// Store reference to io for bot manager to emit messages
manager.io = io;

httpServer.listen(HTTP_PORT, () => {
  console.log(`\n🌐 HTTP Server listening on port ${HTTP_PORT}`);
  console.log(`   POST /trigger-bot - External delegation endpoint`);
  console.log(`   GET  /health      - Health check`);
  console.log(`   WebSocket enabled for UI connections\n`);
});

// Graceful shutdown handlers
const shutdown = async () => {
  console.log('\n\n🛑 Received shutdown signal...');
  nudgeManager.stop();
  terminalManager.killAll();
  await manager.stopAll();
  process.exit(0);
};

process.on('SIGINT', shutdown);  // Ctrl+C
process.on('SIGTERM', shutdown); // Kill signal

// Uncaught error handlers
process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught Exception:', error);
  console.error('   Stack:', error.stack);
  // Don't exit - keep bots running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ Unhandled Rejection at:', promise);
  console.error('   Reason:', reason);
  // Don't exit - keep bots running
});

// Optional: Periodic cleanup of old sessions
if (process.env.CLEANUP_OLD_SESSIONS === 'true') {
  const cleanupIntervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24');
  const cleanupAgeDays = parseInt(process.env.CLEANUP_AGE_DAYS || '90');

  console.log(`🧹 Session cleanup enabled: Every ${cleanupIntervalHours}h, delete sessions older than ${cleanupAgeDays} days\n`);

  setInterval(() => {
    console.log('\n🧹 Running session cleanup...');
    for (const [botId] of manager.bots) {
      const deleted = manager.sessionManager.cleanupOldSessions(botId, cleanupAgeDays);
      if (deleted > 0) {
        console.log(`   Deleted ${deleted} old sessions for bot ${botId}`);
      }
    }
  }, cleanupIntervalHours * 60 * 60 * 1000);
}
