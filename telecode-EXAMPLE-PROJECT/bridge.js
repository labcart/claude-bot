/**
 * Claude Telegram Relay Bot
 * 
 * This bot allows you to interact with Claude CLI sessions remotely via Telegram.
 * It works by piping messages to `claude --ide --resume <session-id>` and capturing
 * the stdout response.
 * 
 * Architecture:
 *   [Telegram] → [Bot] → [echo "msg" | claude --ide --resume <id>] → [Response]
 * 
 * Key Features:
 * - Lists and connects to existing Claude sessions
 * - Maintains conversation context (messages go to same session file)
 * - Handles multiple messages concurrently (Claude CLI queues them)
 * - 2-minute timeout prevents hanging
 * - Session previews show title, timestamp, and last message
 * 
 * Session State Machine:
 * - 'idle': No project/session selected
 * - 'selecting_project': Showing project list, waiting for selection
 * - 'listing': Showing session list, waiting for selection
 * - 'connected': Connected to a session, can send messages
 */

const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { sendToClaudeSession: claudeWrapper } = require('./claude-wrapper-v2');
const diff = require('diff');
require('dotenv').config();

// ============================================================================
// Configuration
// ============================================================================

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) { console.error('❌ Missing TELEGRAM_TOKEN'); process.exit(1); }

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const CLAUDE_CMD = process.env.CLAUDE_CMD || 'claude';
const ALLOWED = (process.env.ALLOWED_CHAT_IDS || '')
  .split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
const TRUST_FIRST = process.env.ALLOW_FIRST_CHAT === '1';

// ============================================================================
// State Management
// ============================================================================

// Session state per Telegram chat
// Each chat can connect to one Claude session at a time
const sessions = new Map();

// Telegram bot instance (long-polling mode)
const bot = new TelegramBot(TOKEN, { polling: true });

// Set of authorized chat IDs
const allow = new Set(ALLOWED);

console.log('🤖 Claude Telegram Relay starting...');
console.log(`📁 Project: ${PROJECT_DIR}`);
console.log(`🔧 Claude command: ${CLAUDE_CMD}`);
console.log(`🔒 Allowed chats: ${Array.from(allow).join(', ') || 'NONE (will trust first chat)'}`);

// Set up command menu (appears in Telegram's menu button)
bot.setMyCommands([
  { command: 'start', description: 'Show help message' },
  { command: 'resume', description: 'Select project and connect to session' },
  { command: 'status', description: 'Check connection status' },
  { command: 'permissions', description: 'Toggle permission prompts on/off' },
  { command: 'leave', description: 'Disconnect from current session' }
]).then(() => {
  console.log('📋 Command menu configured');
}).catch(err => {
  console.error('⚠️  Failed to set command menu:', err.message);
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get or create session state for a Telegram chat
 * @param {number} chatId - Telegram chat ID
 * @returns {Object} Session state object
 */
function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      state: 'idle',             // Current state: idle, selecting_project, listing, connected, or awaiting_permission
      selectedProject: null,     // Encoded project path (for finding sessions)
      selectedProjectPath: null, // Real filesystem path (for cwd in exec)
      sessionId: null,           // UUID of connected Claude session
      projectList: [],           // Cached list of available projects
      sessionList: [],           // Cached list of available sessions
      pendingPermission: null,   // Pending permission request: { toolName, input, resolve }
      pendingPermissionMessageId: null, // Message ID of the permission request (for quoting)
      pendingDiff: null,         // Pending diff download: { content, filename }
      permissionsEnabled: true   // Whether to prompt for permissions (true) or auto-approve (false)
    });
  }
  return sessions.get(chatId);
}

/**
 * Get list of all Claude projects
 * @returns {Array<Object>} Array of project objects with encoded name and real path
 */
function getProjects() {
  const claudeDir = path.join(require('os').homedir(), '.claude', 'projects');
  
  if (!fs.existsSync(claudeDir)) {
    return [];
  }
  
  const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const projectPath = path.join(claudeDir, dirent.name);
      const stat = fs.statSync(projectPath);

      // Read the REAL path from a session file's 'cwd' field
      // This is the ONLY reliable way to get the actual project path
      // because Claude's encoding is lossy (dashes are ambiguous)
      let realPath = dirent.name; // Fallback to encoded name if we can't read

      try {
        // Find any .jsonl file in this project directory
        const sessionFiles = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));

        if (sessionFiles.length > 0) {
          // Read first session file and look for cwd in any of the first 10 lines
          const sessionFile = path.join(projectPath, sessionFiles[0]);
          const content = fs.readFileSync(sessionFile, 'utf8');
          const lines = content.split('\n').slice(0, 10); // Check first 10 lines

          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                // Extract the cwd field - this is the REAL project path
                if (parsed.cwd) {
                  realPath = parsed.cwd;
                  break; // Found it, stop searching
                }
              } catch (parseErr) {
                // Skip lines that aren't valid JSON
                continue;
              }
            }
          }
        }
      } catch (err) {
        // If we can't read the session file, fall back to encoded name
        console.warn(`⚠️  Could not read real path for ${dirent.name}: ${err.message}`);
      }

      return {
        name: dirent.name,        // Encoded name (for finding sessions)
        realPath: realPath,       // Real filesystem path (from cwd field)
        displayName: realPath,    // Human-readable name
        modified: stat.mtimeMs
      };
    });
  
  // Sort by most recently modified
  projectDirs.sort((a, b) => b.modified - a.modified);
  
  return projectDirs;
}

/**
 * Format a timestamp as a human-readable "time ago" string
 * @param {Date} date - The timestamp to format
 * @returns {string} Formatted time string (e.g., "5m ago", "2h ago")
 */
function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Generate a human-readable diff for file operations
 * 
 * For Write/Edit tools, compares the old file content (if exists) with the new
 * content from Claude and generates a unified diff showing what changed.
 * 
 * Handles two input formats:
 * - Write tool: { path: "...", content: "..." }
 * - Edit tool: { file_path: "...", old_string: "...", new_string: "..." }
 * 
 * Returns truncated preview for large diffs with option to download full version.
 * 
 * @param {string} toolName - The name of the tool (e.g., "Write", "Edit")
 * @param {Object} input - The tool input from Claude
 * @param {string} projectPath - The project directory path (for resolving relative paths)
 * @returns {Object|null} { message: string, fullDiff: string, isTruncated: boolean } or null if no diff needed
 */
function generateDiff(toolName, input, projectPath) {
  // Only generate diffs for file write/edit operations
  if (toolName !== 'Write' && toolName !== 'Edit') {
    return null;
  }
  
  try {
    let filePath, oldContent, newContent, displayPath;
    
    // Handle Edit tool format (file_path, old_string, new_string)
    if (toolName === 'Edit' && input.file_path) {
      filePath = path.isAbsolute(input.file_path) 
        ? input.file_path 
        : path.join(projectPath, input.file_path);
      displayPath = input.file_path;
      
      // For Edit tool, we can construct the full diff from the edit operation
      // Read the current file content
      if (!fs.existsSync(filePath)) {
        return null; // Can't edit a file that doesn't exist
      }
      
      oldContent = fs.readFileSync(filePath, 'utf8');
      
      // Apply the edit to get new content
      if (typeof input.old_string === 'string' && typeof input.new_string === 'string') {
        // Replace first occurrence of old_string with new_string
        newContent = oldContent.replace(input.old_string, input.new_string);
      } else {
        return null; // Invalid edit format
      }
    } 
    // Handle Write tool format - can use either 'path' or 'file_path'
    else if (toolName === 'Write' && typeof input.content === 'string') {
      const inputPath = input.path || input.file_path;
      if (!inputPath) {
        return null; // No path provided
      }
      
      filePath = path.isAbsolute(inputPath) 
        ? inputPath 
        : path.join(projectPath, inputPath);
      displayPath = inputPath;
      newContent = input.content;
      
      // Read old content if file exists
      if (fs.existsSync(filePath)) {
        oldContent = fs.readFileSync(filePath, 'utf8');
      } else {
        // New file creation
        const lines = newContent.split('\n').length;
        const message = `📄 **Creating new file:** \`${displayPath}\`\n💾 ${lines} lines\n`;
        return {
          message,
          fullDiff: newContent,
          displayPath,
          isTruncated: false
        };
      }
    } else {
      return null; // Invalid input format
    }
    
    // Generate the diff
    const patch = diff.createPatch(
      displayPath,          // filename
      oldContent,           // old content
      newContent,           // new content
      'before',             // old header
      'after'               // new header
    );
    
    // Parse the patch to extract just the diff lines (skip headers)
    const lines = patch.split('\n');
    const diffLines = lines.slice(4); // Skip the first 4 header lines
    
    // If no changes, skip
    if (diffLines.every(line => !line.startsWith('+') && !line.startsWith('-'))) {
      return null;
    }
    
    // Full diff text
    const fullDiffText = diffLines.join('\n');
    
    // Truncate if too long (leave room for markdown formatting + message text)
    const MAX_INLINE_LENGTH = 2800; // Safe limit under Telegram's 4096
    let previewText = fullDiffText;
    let isTruncated = false;
    
    if (fullDiffText.length > MAX_INLINE_LENGTH) {
      // Truncate to first N lines
      const truncatedLines = [];
      let currentLength = 0;
      
      for (const line of diffLines) {
        if (currentLength + line.length + 1 > MAX_INLINE_LENGTH) {
          break;
        }
        truncatedLines.push(line);
        currentLength += line.length + 1;
      }
      
      const remainingLines = diffLines.length - truncatedLines.length;
      previewText = truncatedLines.join('\n');
      previewText += `\n\n[⚠️ Diff truncated - ${remainingLines} more lines not shown]`;
      isTruncated = true;
    }
    
    const message = `✏️ **Editing:** \`${displayPath}\`\n\n\`\`\`diff\n${previewText}\n\`\`\``;
    
    return {
      message,
      fullDiff: fullDiffText,
      displayPath,
      isTruncated
    };
  } catch (err) {
    console.error(`Failed to generate diff:`, err);
    return null;
  }
}

// ============================================================================
// Claude CLI Integration
// ============================================================================

/**
 * Send a message to a Claude session via CLI (using stream-json protocol)
 * 
 * This uses the claude-wrapper to spawn a subprocess with streaming support:
 *   claude --ide --resume <id> --output-format stream-json --verbose
 * 
 * Benefits of stream-json protocol:
 * - Real-time streaming updates (onStream callback)
 * - Structured JSON responses
 * - Programmatic permission handling (onPermissionRequest callback)
 * - Better error messages
 * 
 * The KEY to multi-project support: We set `cwd` to the target project directory.
 * Claude CLI uses the current working directory to determine which project's sessions to access.
 * 
 * Multiple messages can be sent concurrently - Claude CLI handles queuing.
 * Each spawns a separate process, but they all write to the same session file.
 * 
 * @param {number} chatId - Telegram chat ID (for logging)
 * @param {string} message - Message to send to Claude
 * @param {string} sessionId - Claude session UUID
 * @param {string} projectPath - Real filesystem path to project (for cwd)
 * @param {function} onStream - Optional callback for streaming updates: (text) => void
 * @param {function} onPermissionRequest - Optional callback for permission requests: (toolName, input) => Promise<boolean>
 * @returns {Promise<string>} Claude's full response
 * @throws {Error} If command fails
 */
async function sendToClaudeSession(chatId, message, sessionId, projectPath, onStream = null, onPermissionRequest = null) {
  console.log(`[REQUEST from ${chatId}]: ${message.substring(0, 100)}...`);
  
  const result = await claudeWrapper({
    message,
    sessionId,
    projectPath,
    claudeCmd: CLAUDE_CMD,
    onStream,
    onPermissionRequest
  });
  
  if (!result.success) {
    throw new Error(result.error || 'Unknown error');
  }
  
  console.log(`[RESPONSE to ${chatId}]: ${result.text.substring(0, 100)}...`);
  return result.text;
}

// ============================================================================
// Command Handlers
// ============================================================================

/**
 * Handle /resume command - List all available Claude projects
 * 
 * This reads project directories from:
 *   ~/.claude/projects/
 * 
 * Shows all projects sorted by most recent activity with:
 * - Project path
 * - Time since last activity
 * 
 * @param {number} chatId - Telegram chat ID
 */
async function handleResume(chatId) {
  try {
    const projects = getProjects();
    
    if (projects.length === 0) {
      return bot.sendMessage(chatId, '❌ No projects found.');
    }
    
    const sess = getSession(chatId);
    sess.projectList = projects;
    sess.state = 'selecting_project';
    
    let message = `📁 **Select a Project** (${projects.length} total):\n\n`;
    projects.forEach((p, i) => {
      const date = new Date(p.modified);
      const timeAgo = getTimeAgo(date);
      message += `${i + 1}. \`${p.displayName}\`\n   📅 ${timeAgo}\n\n`;
    });
    message += `💬 Tap a button or reply with a number:`;
    
    // Create inline keyboard with buttons for first 5 projects
    const keyboard = [];
    const maxButtons = Math.min(projects.length, 5);
    
    // Create rows of 2 buttons each
    for (let i = 0; i < maxButtons; i += 2) {
      const row = [
        { text: `${i + 1}. ${projects[i].displayName}`, callback_data: `project_${i}` }
      ];
      if (i + 1 < maxButtons) {
        row.push({ text: `${i + 2}. ${projects[i + 1].displayName}`, callback_data: `project_${i + 1}` });
      }
      keyboard.push(row);
    }
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (e) {
    console.error(`Error listing projects:`, e);
    await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

/**
 * Handle project selection by number
 * 
 * After /resume shows the project list, user replies with a number.
 * This loads sessions from the selected project and shows the session list.
 * 
 * @param {number} chatId - Telegram chat ID
 * @param {string} text - User's numeric selection (e.g., "1")
 */
async function handleProjectSelection(chatId, text) {
  const sess = getSession(chatId);
  
  const num = parseInt(text);
  if (isNaN(num) || num < 1 || num > sess.projectList.length) {
    return bot.sendMessage(chatId, `❌ Invalid number. Try /resume again.`);
  }
  
  const project = sess.projectList[num - 1];
  sess.selectedProject = project.name;           // Encoded for finding sessions
  sess.selectedProjectPath = project.realPath;   // Real path for cwd
  
  console.log(`📁 Chat ${chatId} selected project: ${project.displayName}`);
  
  // Now show sessions for this project
  await handleProjectSessionList(chatId);
}

/**
 * List sessions for the current project
 * 
 * This reads session files from:
 *   ~/.claude/projects/<selected-project>/<session-id>.jsonl
 * 
 * For each session:
 * - Parses .jsonl to extract title (from summary line)
 * - Finds last assistant message for preview
 * - Gets file modification time
 * 
 * Shows 10 most recent sessions with:
 * - Title (or "Untitled" if no summary)
 * - Time since last activity
 * - Preview of last assistant message (80 chars)
 * 
 * @param {number} chatId - Telegram chat ID
 */
async function handleProjectSessionList(chatId) {
  const sess = getSession(chatId);
  
  try {
    const sessionDir = path.join(require('os').homedir(), '.claude', 'projects', sess.selectedProject);
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
    
    if (files.length === 0) {
      sess.state = 'idle';
      sess.selectedProject = null;
      return bot.sendMessage(chatId, '❌ No sessions found in this project.');
    }
    
    const sessions = [];
    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');

      let sessionId = null;
      let title = 'Untitled';
      let lastMessage = null;

      // Find sessionId and title from file content
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          // Get the actual sessionId from the file
          if (parsed.sessionId) {
            sessionId = parsed.sessionId;
          }
          if (parsed.type === 'summary' && parsed.summary) {
            title = parsed.summary;
          }
          if (sessionId && title !== 'Untitled') {
            break; // Found both, stop searching
          }
        } catch (e) {}
      }

      // Skip sessions without valid sessionId
      if (!sessionId) {
        console.warn(`⚠️  Skipping ${file} - no valid sessionId found`);
        continue;
      }
      
      // Find last assistant message
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.type === 'assistant' && parsed.message?.content) {
            const textContent = parsed.message.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join(' ');
            if (textContent) {
              lastMessage = textContent.substring(0, 80).trim();
              if (textContent.length > 80) lastMessage += '...';
              break;
            }
          }
        } catch (e) {}
      }
      
      const stat = fs.statSync(filePath);
      sessions.push({ id: sessionId, title, modified: stat.mtimeMs, lastMessage });
    }
    
    sessions.sort((a, b) => b.modified - a.modified);
    
    // Show only last 10 sessions
    const recentSessions = sessions.slice(0, 10);
    
    sess.sessionList = recentSessions;
    sess.state = 'listing';
    
    // Display the real filesystem path when available; avoid reconstructing
    // from the encoded name which can mangle '-' vs '/'.
    const projectDisplay = sess.selectedProjectPath || sess.selectedProject;
    let message = `📋 **Sessions in** \`${projectDisplay}\` (showing 10 of ${sessions.length}):\n\n`;
    recentSessions.forEach((s, i) => {
      const date = new Date(s.modified);
      const timeAgo = getTimeAgo(date);
      message += `${i + 1}. **${s.title}**\n   📅 ${timeAgo}`;
      if (s.lastMessage) {
        // Escape Markdown special characters in preview text
        const escapedMessage = s.lastMessage.replace(/[_*`\[\]]/g, '\\$&');
        message += `\n   💬 "${escapedMessage}"`;
      }
      message += `\n\n`;
    });
    message += `💬 Tap a button or reply with a number:`;
    
    // Create inline keyboard with buttons for first 5 sessions
    const keyboard = [];
    const maxButtons = Math.min(recentSessions.length, 5);
    
    // Create rows of 2 buttons each
    for (let i = 0; i < maxButtons; i += 2) {
      const row = [
        { text: `${i + 1}. ${recentSessions[i].title}`, callback_data: `session_${i}` }
      ];
      if (i + 1 < maxButtons) {
        row.push({ text: `${i + 2}. ${recentSessions[i + 1].title}`, callback_data: `session_${i + 1}` });
      }
      keyboard.push(row);
    }
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (e) {
    console.error(`Error listing sessions:`, e);
    sess.state = 'idle';
    sess.selectedProject = null;
    await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

/**
 * Handle session selection by number
 * 
 * After project sessions are shown, user replies with a number (1-10).
 * This validates the selection and updates session state to 'connected'.
 * 
 * @param {number} chatId - Telegram chat ID
 * @param {string} text - User's numeric selection (e.g., "1")
 */
async function handleSessionSelection(chatId, text) {
  const sess = getSession(chatId);
  
  const num = parseInt(text);
  if (isNaN(num) || num < 1 || num > sess.sessionList.length) {
    return bot.sendMessage(chatId, `❌ Invalid number. Try /resume again.`);
  }
  
  const session = sess.sessionList[num - 1];
  sess.sessionId = session.id;
  sess.state = 'connected';
  
  console.log(`🔗 Chat ${chatId} connected to session ${session.id} (${session.title})`);
  
  await bot.sendMessage(chatId, `✅ Connected to: ${session.title}\n\nSend messages now!`);
}

/**
 * Handle regular message - send to Claude and return response
 * 
 * Flow:
 * 1. Verify user is connected to a session
 * 2. Send "Thinking..." indicator
 * 3. Pipe message to Claude CLI
 * 4. Wait for response (or timeout after 2 min)
 * 5. Send response back in chunks (Telegram has 4096 char limit)
 * 
 * Multiple messages can be sent concurrently - they'll all be queued by Claude CLI
 * and processed in order with full conversation context.
 * 
 * @param {number} chatId - Telegram chat ID
 * @param {string} text - User's message to send to Claude
 */
async function handleMessage(chatId, text) {
  const sess = getSession(chatId);
  
  if (sess.state !== 'connected' || !sess.sessionId || !sess.selectedProjectPath) {
    return bot.sendMessage(chatId, '❌ Not connected. Use /resume first.');
  }
  
  try {
    // Send initial "thinking" message
    const statusMsg = await bot.sendMessage(chatId, '⏳ Thinking...');
    let streamedText = '';
    let lastUpdate = Date.now();
    
    // Stream callback - update message as responses come in
    const onStream = async (chunk) => {
      streamedText += chunk;
      
      // Throttle updates to max 1 per second to avoid rate limits
      const now = Date.now();
      if (now - lastUpdate > 1000) {
        lastUpdate = now;
        try {
          // Edit the status message with current streamed content
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
    
    // Permission callback - ask user via Telegram
    const onPermissionRequest = async (toolName, input) => {
      console.log(`🔐 Permission requested for: ${toolName}`);
      
      // Try to generate a diff for file operations
      const diffResult = generateDiff(toolName, input, sess.selectedProjectPath);
      
      if (diffResult) {
        // Send the diff preview as a separate message
        const diffMsgOptions = { parse_mode: 'Markdown' };
        
        // If truncated, add download button
        if (diffResult.isTruncated) {
          diffMsgOptions.reply_markup = {
            inline_keyboard: [
              [{ text: '📎 Download Full Diff', callback_data: `download_diff_${chatId}` }]
            ]
          };
          // Store full diff in session for download
          sess.pendingDiff = {
            content: diffResult.fullDiff,
            filename: `${path.basename(diffResult.displayPath)}.diff.txt`
          };
        }
        
        await bot.sendMessage(chatId, diffResult.message, diffMsgOptions);
      }
      
      // For non-file operations or if diff generation failed, show raw input
      let permissionMessage = `🔐 **Permission Request**\n\nTool: \`${toolName}\`\n\n`;
      
      if (!diffResult) {
        // Show raw input preview for non-file operations
        const inputPreview = JSON.stringify(input, null, 2).substring(0, 300);
        permissionMessage += `Input:\n\`\`\`\n${inputPreview}\n\`\`\`\n\n`;
      }
      
      permissionMessage += `Tap a button or reply with "approve" or "deny":`;
      
      // Send with inline keyboard buttons
      const permissionMsg = await bot.sendMessage(chatId, permissionMessage, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `permission_approve_${chatId}` },
              { text: '❌ Deny', callback_data: `permission_deny_${chatId}` }
            ]
          ]
        }
      });
      
      // Wait for user response (button or text)
      return new Promise((resolve) => {
        sess.pendingPermission = { toolName, input, resolve };
        sess.pendingPermissionMessageId = permissionMsg.message_id;
        sess.state = 'awaiting_permission';
      });
    };
    
    // Send message with streaming and permission handling
    // Only pass onPermissionRequest if user has permissions enabled
    const response = await sendToClaudeSession(
      chatId, 
      text, 
      sess.sessionId, 
      sess.selectedProjectPath, 
      onStream, 
      sess.permissionsEnabled ? onPermissionRequest : null
    );
    
    // Delete the thinking/preview message
    try {
      await bot.deleteMessage(chatId, statusMsg.message_id);
    } catch (e) {
      // Ignore delete errors
    }
    
    // Send final response
    if (response) {
      // Split response into chunks to respect Telegram's message size limit
      const MAX_LENGTH = 4000; // Leave some margin under 4096 limit
      for (let i = 0; i < response.length; i += MAX_LENGTH) {
        await bot.sendMessage(chatId, response.substring(i, i + MAX_LENGTH));
      }
    } else {
      await bot.sendMessage(chatId, '❌ No response from Claude');
    }
  } catch (e) {
    console.error(`Error sending message for chat ${chatId}:`, e);
    await bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
}

// ============================================================================
// Main Message Handler
// ============================================================================

/**
 * Main message handler - routes all incoming Telegram messages
 * 
 * Handles:
 * - Authorization (ALLOWED_CHAT_IDS or ALLOW_FIRST_CHAT)
 * - Commands: /start, /help, /resume, /leave, /status
 * - Project selection (numeric input in 'selecting_project' state)
 * - Session selection (numeric input in 'listing' state)
 * - Regular messages (when in 'connected' state)
 * 
 * State machine:
 * - 'idle' → /resume → 'selecting_project'
 * - 'selecting_project' → select number → 'listing'
 * - 'listing' → select number → 'connected'
 * - 'connected' → send messages → stay in 'connected'
 * - any state → /leave → 'idle'
 */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (!text) return;
  
  // Authorization
  if (!allow.has(chatId)) {
    if (TRUST_FIRST && allow.size === 0) {
      allow.add(chatId);
      console.log(`✅ Trusted first chat: ${chatId}`);
    } else {
      console.log(`⛔ Unauthorized chat: ${chatId}`);
      return bot.sendMessage(chatId, '⛔ Unauthorized.');
    }
  }
  
  console.log(`📨 Chat ${chatId}: ${text}`);
  
  const sess = getSession(chatId);
  
  // Commands
  if (text === '/start' || text === '/help') {
    return bot.sendMessage(chatId, `🤖 **Claude Telegram Relay**\n\n/resume - Select project and connect to sessions\n/leave - Disconnect\n/status - Check connection\n/permissions - Toggle permission prompts\n\nOnce connected, just send messages!`);
  }
  
  if (text === '/resume') {
    return handleResume(chatId);
  }
  
  if (text === '/leave') {
    sess.state = 'idle';
    sess.sessionId = null;
    sess.selectedProject = null;
    sess.selectedProjectPath = null;
    return bot.sendMessage(chatId, '👋 Disconnected.');
  }
  
  if (text === '/permissions') {
    sess.permissionsEnabled = !sess.permissionsEnabled;
    const status = sess.permissionsEnabled ? '🔐 **ON**' : '🔓 **OFF**';
    const explanation = sess.permissionsEnabled 
      ? 'Claude will ask for approval via Telegram before using tools (file write, browser, etc.)'
      : 'Claude will auto-approve all tool use (faster, but less control)';
    return bot.sendMessage(chatId, 
      `Permission prompts are now ${status}\n\n${explanation}`,
      { parse_mode: 'Markdown' }
    );
  }
  
  if (text === '/status') {
    const projectDisplay = sess.selectedProjectPath || 'none';
    const permStatus = sess.permissionsEnabled ? '🔐 ON (interactive)' : '🔓 OFF (auto-approve)';
    return bot.sendMessage(chatId, `Status: ${sess.state}\nProject: ${projectDisplay}\nSession: ${sess.sessionId || 'none'}\nPermissions: ${permStatus}`);
  }
  
  // Project selection
  if (sess.state === 'selecting_project' && /^\d+$/.test(text)) {
    return handleProjectSelection(chatId, text);
  }
  
  // Session selection
  if (sess.state === 'listing' && /^\d+$/.test(text)) {
    return handleSessionSelection(chatId, text);
  }
  
  // Permission response
  if (sess.state === 'awaiting_permission' && sess.pendingPermission) {
    const response = text.toLowerCase().trim();
    if (response === 'approve' || response === '✅ approve' || response === 'yes' || response === 'allow') {
      console.log(`✅ User approved: ${sess.pendingPermission.toolName}`);
      sess.pendingPermission.resolve(true);
      sess.pendingPermission = null;
      sess.pendingPermissionMessageId = null;
      sess.state = 'connected';
      return bot.sendMessage(chatId, '✅ Approved. Claude will continue...');
    } else if (response === 'deny' || response === '❌ deny' || response === 'no' || response === 'block') {
      console.log(`❌ User denied: ${sess.pendingPermission.toolName}`);
      sess.pendingPermission.resolve(false);
      sess.pendingPermission = null;
      sess.pendingPermissionMessageId = null;
      sess.state = 'connected';
      return bot.sendMessage(chatId, '❌ Denied. Claude cannot perform this action.');
    } else {
      // Send reminder that quotes the original permission request
      const replyOptions = {};
      if (sess.pendingPermissionMessageId) {
        replyOptions.reply_to_message_id = sess.pendingPermissionMessageId;
      }
      return bot.sendMessage(
        chatId, 
        '❗ Please respond to the permission request above before sending additional messages.',
        replyOptions
      );
    }
  }
  
  // Regular message
  if (sess.state === 'connected') {
    return handleMessage(chatId, text);
  }
  
  // Unknown state
  bot.sendMessage(chatId, '❓ Use /resume to connect first.');
});

// Handle inline button callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  // Check if user is allowed
  if (!ALLOWED.includes(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: '❌ Unauthorized' });
  }
  
  const sess = getSession(chatId);
  
  // Handle project selection buttons
  if (data.startsWith('project_')) {
    const projectIndex = parseInt(data.replace('project_', ''));
    if (sess.state !== 'selecting_project' || !sess.projectList || projectIndex >= sess.projectList.length) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ Invalid selection' });
    }
    
    const project = sess.projectList[projectIndex];
    sess.selectedProject = project.name;
    sess.selectedProjectPath = project.realPath;
    
    console.log(`📁 Chat ${chatId} selected project via button: ${project.displayName}`);
    
    await bot.answerCallbackQuery(query.id, { text: `📁 ${project.displayName}` });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
    
    // Show sessions for this project
    await handleProjectSessionList(chatId);
    return;
  }
  
  // Handle session selection buttons
  if (data.startsWith('session_')) {
    const sessionIndex = parseInt(data.replace('session_', ''));
    if (sess.state !== 'listing' || !sess.sessionList || sessionIndex >= sess.sessionList.length) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ Invalid selection' });
    }
    
    const session = sess.sessionList[sessionIndex];
    sess.sessionId = session.id;
    sess.state = 'connected';
    
    console.log(`🔗 Chat ${chatId} connected via button to session ${session.id} (${session.title})`);
    
    await bot.answerCallbackQuery(query.id, { text: `🔗 ${session.title}` });
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
    
    await bot.sendMessage(chatId, 
      `✅ **Connected to:** ${session.title}\n\n` +
      `💬 Send a message to continue the conversation`
    );
    return;
  }
  
  // Handle permission buttons
  if (data.startsWith('permission_approve_') || data.startsWith('permission_deny_')) {
    if (sess.state !== 'awaiting_permission' || !sess.pendingPermission) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ No pending permission request' });
    }
    
    const isApprove = data.startsWith('permission_approve_');
    
    console.log(`${isApprove ? '✅' : '❌'} User ${isApprove ? 'approved' : 'denied'} via button: ${sess.pendingPermission.toolName}`);
    
    // Resolve the permission promise
    sess.pendingPermission.resolve(isApprove);
    sess.pendingPermission = null;
    sess.pendingPermissionMessageId = null;
    sess.state = 'connected';
    
    // Update the button message to show what was chosen
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId,
      message_id: query.message.message_id
    });
    
    // Send confirmation
    await bot.answerCallbackQuery(query.id, { 
      text: isApprove ? '✅ Approved!' : '❌ Denied!' 
    });
    
    await bot.sendMessage(chatId, 
      isApprove 
        ? '✅ Approved. Claude will continue...' 
        : '❌ Denied. Claude cannot perform this action.'
    );
    
    return;
  }
  
  // Handle diff download button
  if (data.startsWith('download_diff_')) {
    if (!sess.pendingDiff) {
      return bot.answerCallbackQuery(query.id, { text: '⚠️ Diff no longer available' });
    }
    
    console.log(`📎 User downloading full diff: ${sess.pendingDiff.filename}`);
    
    try {
      // Send the full diff as a text file
      await bot.sendDocument(chatId, 
        Buffer.from(sess.pendingDiff.content, 'utf-8'),
        {},
        {
          filename: sess.pendingDiff.filename,
          contentType: 'text/plain'
        }
      );
      
      await bot.answerCallbackQuery(query.id, { text: '📎 Sent!' });
      
      // Clear the pending diff after sending
      sess.pendingDiff = null;
      
      // Remove the download button from the original message
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: chatId,
        message_id: query.message.message_id
      });
    } catch (error) {
      console.error('Error sending diff file:', error);
      await bot.answerCallbackQuery(query.id, { text: '❌ Failed to send file' });
    }
    
    return;
  }
  
  // Unknown callback
  bot.answerCallbackQuery(query.id, { text: '❓ Unknown action' });
});

console.log('✅ Bot is running! Send /start to your bot to begin.');
