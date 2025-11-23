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

// Create bot manager
const manager = new BotManager({
  claudeCmd: process.env.CLAUDE_CMD || 'claude'
});

// Create terminal manager
const terminalManager = new TerminalManager();

/**
 * Load Bot Configurations and Initialize
 *
 * Two modes supported:
 * 1. Web UI Mode: Fetch bots from Supabase (requires USER_ID and COORDINATION_URL)
 * 2. Telegram Mode: Read from bots.json (legacy/local setup)
 */
(async () => {
  let bots;
  const USER_ID = process.env.USER_ID;
  const COORDINATION_URL = process.env.COORDINATION_URL?.replace('/api/servers/register', '/api') || process.env.COORDINATION_URL;

  if (USER_ID && COORDINATION_URL) {
    // WEB UI MODE: Fetch bots from Supabase
    console.log('🌐 Web UI Mode: Fetching bots from database...');
    console.log(`   User ID: ${USER_ID}`);

    try {
      const botsUrl = `${COORDINATION_URL}/bots?userId=${USER_ID}`;
      const response = await fetch(botsUrl);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error: Failed to fetch bots from database');
        console.error(`   Status: ${response.status}`);
        console.error(`   Error: ${errorText}\n`);
        process.exit(1);
      }

      const data = await response.json();
      bots = (data.bots || []).filter(bot => bot.active);

      if (bots.length === 0) {
        console.error('❌ Error: No active bots found for this user');
        console.error('   Run: node scripts/init-bots.js to create bots from brain files\n');
        process.exit(1);
      }

      console.log(`✅ Loaded ${bots.length} bot(s) from database`);

      // Transform database format to internal format
      bots = bots.map(bot => ({
        id: bot.id,
        brain: bot.id, // Use bot UUID - BrainLoader will load from database
        webOnly: bot.web_only !== undefined ? bot.web_only : true,
        active: bot.active,
        // Note: workspace is NOT used - it comes from UI per-message
      }));

    } catch (error) {
      console.error('❌ Error: Failed to connect to database');
      console.error(`   ${error.message}\n`);
      process.exit(1);
    }

  } else {
    // TELEGRAM MODE: Read from bots.json
    console.log('📱 Telegram Mode: Loading bots from bots.json...');

    const botsConfigPath = path.join(__dirname, 'bots.json');

    if (!fs.existsSync(botsConfigPath)) {
      console.error('❌ Error: bots.json file not found');
      console.error('   For Web UI: Set USER_ID and COORDINATION_URL in .env');
      console.error('   For Telegram: Create bots.json (see bots.json.example)\n');
      process.exit(1);
    }

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

    // Validate each bot config (Telegram mode requires tokens)
    for (const bot of bots) {
      if (!bot.id || !bot.brain || (!bot.token && !bot.webOnly)) {
        console.error('❌ Error: Each bot must have id and brain fields (token required unless webOnly)');
        console.error('   Invalid bot config:', JSON.stringify(bot, null, 2));
        process.exit(1);
      }
    }

    console.log(`✅ Loaded ${bots.length} bot(s) from bots.json`);
  }

  // Add each bot
  console.log('🚀 Initializing bots...\n');

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

// Start HTTP server for external delegation requests
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();

// CORS middleware for HTTP requests (fetch API calls from browser)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow labcart.io and localhost
  if (origin && (origin.includes('labcart.io') || origin.includes('localhost'))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
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

/**
 * Register this bot server with the coordination API
 */
/**
 * Connect to WebSocket proxy for remote IDE connections
 */
async function connectToProxy() {
  const userId = process.env.USER_ID;
  const serverUrl = process.env.SERVER_URL || `http://localhost:${HTTP_PORT}`;
  const proxyUrl = process.env.IDE_WS_PROXY_URL || 'wss://ide-ws.labcart.io';

  if (!userId) {
    console.log('ℹ️  No USER_ID configured - skipping proxy connection');
    console.log('   Set USER_ID env var to enable IDE proxy\n');
    return;
  }

  try {
    const WebSocket = require('ws');

    console.log(`🔌 Connecting to IDE WebSocket proxy...`);
    console.log(`   Proxy URL: ${proxyUrl}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Server URL: ${serverUrl}`);

    // Connect as bot-server to proxy using raw WebSocket
    const wsUrl = `${proxyUrl}?userId=${encodeURIComponent(userId)}&type=bot-server&serverUrl=${encodeURIComponent(serverUrl)}`;
    const proxySocket = new WebSocket(wsUrl);

    proxySocket.on('open', () => {
      console.log(`✅ IDE proxy bridge established`);
    });

    proxySocket.on('close', (code, reason) => {
      console.log(`⚠️  Disconnected from IDE proxy: ${reason || code}`);
    });

    proxySocket.on('error', (error) => {
      console.error(`❌ IDE proxy error:`, error);
    });

    // Handle messages from proxy (from frontend IDE clients)
    proxySocket.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        const eventType = message.event || message.type;
        const data = message.data;
        console.log('📨 Received from IDE proxy:', eventType || 'unknown');

        // Helper to send response back through proxy
        const sendToProxy = (event, data) => {
          if (proxySocket.readyState === WebSocket.OPEN) {
            proxySocket.send(JSON.stringify({ event, data }));
          }
        };

        // Process messages directly (no Socket.IO clients exist in proxy mode)
        switch (eventType) {
          case 'chat:send':
          case 'send-message': {
            const { botId, userId, message: userMessage, workspacePath } = data;
            console.log(`📨 Message from IDE for bot ${botId} (workspace: ${workspacePath}):`, userMessage);

            try {
              const botInfo = manager.bots.get(botId);
              if (!botInfo) {
                sendToProxy('error', { message: `Bot ${botId} not found` });
                return;
              }

              // Get or create session for this bot + user
              const currentUuid = manager.sessionManager.getCurrentUuid(botId, userId);
              const isNewSession = !currentUuid;

              if (isNewSession) {
                console.log(`🆕 [${botId}] New IDE session for user ${userId}`);
              } else {
                console.log(`📝 [${botId}] Resuming IDE session ${currentUuid.substring(0, 8)}... for user ${userId}`);
              }

              // Build system prompt for new sessions
              let fullMessage;
              if (isNewSession) {
                const systemPrompt = await manager.brainLoader.buildSystemPrompt(
                  botInfo.config.brain,
                  { id: userId, username: 'ide_user' }
                );
                const securityReminder = await manager.brainLoader.getSecurityReminder(botInfo.config.brain);

                fullMessage = securityReminder
                  ? `${systemPrompt}\n\n---\n\n${securityReminder}\n\n<<<USER_TEXT_START>>>${userMessage}<<<USER_TEXT_END>>>`
                  : `${systemPrompt}\n\n<<<USER_TEXT_START>>>${userMessage}<<<USER_TEXT_END>>>`;
              } else {
                const securityReminder = await manager.brainLoader.getSecurityReminder(botInfo.config.brain);
                fullMessage = securityReminder
                  ? `${securityReminder}\n\n<<<USER_TEXT_START>>>${userMessage}<<<USER_TEXT_END>>>`
                  : `<<<USER_TEXT_START>>>${userMessage}<<<USER_TEXT_END>>>`;
              }

              // Send to Claude directly
              const { sendToClaudeSession } = require('./lib/claude-client');

              sendToProxy('bot-thinking', { botId });

              const result = await sendToClaudeSession({
                message: fullMessage,
                sessionId: currentUuid,
                claudeCmd: manager.claudeCmd,
                workspacePath: workspacePath || process.env.LABCART_WORKSPACE || process.cwd()
              });

              // Save the session UUID
              const sessionUuid = result.metadata?.sessionInfo?.sessionId;
              if (sessionUuid) {
                const workspace = workspacePath || process.env.LABCART_WORKSPACE || process.cwd();
                manager.sessionManager.setCurrentUuid(botId, userId, sessionUuid, workspace);
                console.log(`💾 [${botId}] Saved UUID ${sessionUuid.substring(0, 8)}... for IDE user ${userId} (workspace: ${workspace})`);
              }

              // Update session manager
              manager.sessionManager.incrementMessageCount(botId, userId);
              manager.sessionManager.incrementMessageCount(botId, userId);

              if (result.success && result.text) {
                sendToProxy('bot-message', {
                  botId,
                  userId,
                  message: result.text,
                  sessionUuid: sessionUuid || null,
                  hasAudio: false,
                  hasImages: false,
                  timestamp: Date.now()
                });

                console.log(`✅ [${botId}] Response sent to IDE (${result.text.length} chars)`);
              } else {
                sendToProxy('error', { message: 'Bot returned no response' });
              }
            } catch (error) {
              console.error('❌ Error handling IDE message:', error);
              sendToProxy('error', { message: error.message });
            }
            break;
          }

          case 'terminal:create': {
            const { terminalId, cwd, cols, rows, botId } = data;
            console.log(`🖥️  Create terminal request from IDE: ${terminalId}`);

            try {
              // If terminal already exists, kill it first
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

              // Attach data listener to stream output back to IDE
              const terminalObj = terminalManager.get(terminalId);
              if (terminalObj) {
                terminalObj.ptyProcess.onData((data) => {
                  sendToProxy('terminal:output', { terminalId, data });
                });

                terminalObj.ptyProcess.onExit(({ exitCode, signal }) => {
                  console.log(`🖥️  Terminal ${terminalId} exited with code ${exitCode}${signal ? ` (signal: ${signal})` : ''}`);
                  sendToProxy('terminal:exit', { terminalId, exitCode, signal });
                  terminalManager.kill(terminalId);
                });
              }

              sendToProxy('terminal:created', { terminalId, ...terminal });
            } catch (error) {
              console.error(`❌ Error creating terminal ${terminalId}:`, error);
              sendToProxy('terminal:error', { terminalId, error: error.message });
            }
            break;
          }

          case 'terminal:input': {
            const { terminalId, data: inputData } = data;
            try {
              terminalManager.write(terminalId, inputData);
            } catch (error) {
              console.error(`❌ Error writing to terminal ${terminalId}:`, error);
              sendToProxy('terminal:error', { terminalId, error: error.message });
            }
            break;
          }

          case 'terminal:resize': {
            const { terminalId, cols, rows } = data;
            try {
              terminalManager.resize(terminalId, cols, rows);
            } catch (error) {
              console.error(`❌ Error resizing terminal ${terminalId}:`, error);
              sendToProxy('terminal:error', { terminalId, error: error.message });
            }
            break;
          }

          case 'terminal:kill': {
            const { terminalId } = data;
            try {
              terminalManager.kill(terminalId);
              sendToProxy('terminal:killed', { terminalId });
            } catch (error) {
              console.error(`❌ Error killing terminal ${terminalId}:`, error);
              sendToProxy('terminal:error', { terminalId, error: error.message });
            }
            break;
          }

          default:
            console.log('⚠️  Unknown message from IDE:', eventType, message);
        }
      } catch (error) {
        console.error('❌ Error parsing proxy message:', error);
      }
    });

    // Store proxy socket reference for bot manager to emit messages back
    manager.proxySocket = proxySocket;

  } catch (error) {
    console.error(`❌ Failed to connect to IDE proxy:`, error.message);
  }
}

async function registerServer() {
  const serverId = process.env.SERVER_ID || `server-${require('os').hostname()}`;
  const serverUrl = process.env.SERVER_URL || `http://localhost:${HTTP_PORT}`;
  const userId = process.env.USER_ID;
  const coordinationUrl = process.env.COORDINATION_URL || 'http://localhost:3000/api/servers/register';

  if (!userId) {
    console.log('ℹ️  No USER_ID configured - skipping server registration');
    console.log('   Set USER_ID env var to enable coordination\n');
    return;
  }

  try {
    console.log(`📡 Registering server with coordination API...`);
    console.log(`   Server ID: ${serverId}`);
    console.log(`   Server URL: ${serverUrl}`);
    console.log(`   User ID: ${userId}`);

    const response = await fetch(coordinationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverId,
        userId,
        serverUrl,
        serverName: require('os').hostname(),
        status: 'online',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to register server: ${error}`);
      return;
    }

    const data = await response.json();
    console.log(`✅ Server registered successfully`);

    // Send heartbeat every 30 seconds
    setInterval(async () => {
      try {
        await fetch(coordinationUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId,
            userId,
            serverUrl,
            serverName: require('os').hostname(),
            status: 'online',
          }),
        });
      } catch (err) {
        console.error('❌ Heartbeat failed:', err.message);
      }
    }, 30000);

  } catch (error) {
    console.error(`❌ Error registering server:`, error.message);
  }
}

// Workspace folder resolution endpoint
app.post('/resolve-workspace', async (req, res) => {
  try {
    const { folderName } = req.body;

    if (!folderName) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const { execSync } = require('child_process');
    const sanitizedName = folderName.replace(/['"\\]/g, '');

    // Search locations - prioritize common project locations
    const home = process.env.HOME || '/Users';
    const searchPaths = [
      `${home}/play`,
      `${home}/projects`,
      `${home}/Desktop`,
      `${home}/Documents`,
      `${home}/code`,
      `${home}/dev`,
      process.cwd(),
    ];

    let foundPath = null;

    // Try each search location with reduced depth and timeout
    for (const searchPath of searchPaths) {
      try {
        const result = execSync(
          `find "${searchPath}" -maxdepth 3 -type d -name "${sanitizedName}" 2>/dev/null | head -1`,
          { encoding: 'utf-8', timeout: 2000 }
        ).trim();

        if (result) {
          foundPath = result;
          console.log(`✅ Found workspace at: ${result}`);
          break;
        }
      } catch (err) {
        // Continue to next search path
      }
    }

    if (!foundPath) {
      return res.status(404).json({
        error: 'Folder not found',
        message: `Could not find folder "${sanitizedName}" in any search location`
      });
    }

    res.json({ path: foundPath });
  } catch (error) {
    console.error('Error resolving workspace:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Discover workspaces by finding .claude/ directories (recent Claude Code projects)
app.get('/discover-workspaces', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const home = process.env.HOME || process.env.USERPROFILE;

    console.log('🔍 Discovering workspaces via Claude session logs...');

    // Search common locations for .claude directories
    const searchPaths = [
      home,
      path.join(home, 'projects'),
      path.join(home, 'dev'),
      path.join(home, 'code'),
      path.join(home, 'Documents'),
      '/opt',
      '/var/www',
    ].filter(p => fs.existsSync(p));

    const discoveredWorkspaces = [];
    const seenPaths = new Set();

    for (const searchPath of searchPaths) {
      try {
        // Find .claude directories (max depth 4 to avoid too deep searches)
        const findCmd = `find "${searchPath}" -maxdepth 4 -type d -name ".claude" 2>/dev/null`;
        const result = execSync(findCmd, {
          encoding: 'utf-8',
          timeout: 5000,
          maxBuffer: 1024 * 1024
        }).trim();

        if (!result) continue;

        const claudeDirs = result.split('\n').filter(Boolean);

        for (const claudeDir of claudeDirs) {
          // Workspace path is the parent directory of .claude/
          const workspacePath = path.dirname(claudeDir);

          // Skip if already found
          if (seenPaths.has(workspacePath)) continue;
          seenPaths.add(workspacePath);

          // Get workspace info
          const stats = fs.statSync(workspacePath);
          const name = path.basename(workspacePath);

          // Check if it's a git repo
          const isGitRepo = fs.existsSync(path.join(workspacePath, '.git'));

          // Try to get last session time from .claude/ metadata
          let lastUsed = stats.mtime;
          try {
            const claudeFiles = fs.readdirSync(claudeDir);
            // Look for session files or projects directory
            const projectsDir = path.join(claudeDir, 'projects');
            if (fs.existsSync(projectsDir)) {
              const projectStat = fs.statSync(projectsDir);
              lastUsed = projectStat.mtime;
            }
          } catch (err) {
            // Fallback to directory mtime
          }

          discoveredWorkspaces.push({
            name,
            path: workspacePath,
            isGitRepo,
            lastUsed,
            source: 'claude-session',
          });
        }
      } catch (err) {
        console.error(`Error searching ${searchPath}:`, err.message);
        // Continue to next search path
      }
    }

    // Sort by most recently used
    discoveredWorkspaces.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));

    console.log(`✅ Discovered ${discoveredWorkspaces.length} workspaces via Claude sessions`);

    res.json({ workspaces: discoveredWorkspaces });
  } catch (error) {
    console.error('Error discovering workspaces:', error);
    res.status(500).json({ error: 'Failed to discover workspaces', message: error.message });
  }
});

// List available workspaces in ~/labcart-projects/
app.get('/list-workspaces', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const home = process.env.HOME || process.env.USERPROFILE;
    const workspacesDir = path.join(home, 'labcart-projects');

    // Create directory if it doesn't exist
    if (!fs.existsSync(workspacesDir)) {
      fs.mkdirSync(workspacesDir, { recursive: true });
    }

    // Read directories
    const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
    const workspaces = entries
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const workspacePath = path.join(workspacesDir, entry.name);
        const stats = fs.statSync(workspacePath);

        // Check if it's a git repo
        const isGitRepo = fs.existsSync(path.join(workspacePath, '.git'));

        return {
          name: entry.name,
          path: workspacePath,
          isGitRepo,
          lastModified: stats.mtime,
        };
      })
      .sort((a, b) => b.lastModified - a.lastModified); // Most recent first

    res.json({ workspaces });
  } catch (error) {
    console.error('Error listing workspaces:', error);
    res.status(500).json({ error: 'Failed to list workspaces', message: error.message });
  }
});

// Clone GitHub repository to ~/labcart-projects/
app.post('/clone-repo', async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    // Validate GitHub URL format
    const githubPattern = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+/;
    if (!githubPattern.test(repoUrl)) {
      return res.status(400).json({
        error: 'Invalid GitHub URL',
        message: 'Please provide a valid GitHub repository URL (e.g., https://github.com/user/repo)'
      });
    }

    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const home = process.env.HOME || process.env.USERPROFILE;
    const workspacesDir = path.join(home, 'labcart-projects');

    // Create directory if it doesn't exist
    if (!fs.existsSync(workspacesDir)) {
      fs.mkdirSync(workspacesDir, { recursive: true });
    }

    // Extract repo name from URL
    const repoName = repoUrl.split('/').pop().replace(/\.git$/, '');
    const targetPath = path.join(workspacesDir, repoName);

    // Check if directory already exists
    if (fs.existsSync(targetPath)) {
      return res.status(409).json({
        error: 'Workspace already exists',
        message: `A workspace named "${repoName}" already exists`,
        path: targetPath
      });
    }

    console.log(`📦 Cloning ${repoUrl} to ${targetPath}...`);

    // Clone the repository
    try {
      execSync(`git clone "${repoUrl}" "${targetPath}"`, {
        stdio: 'pipe',
        timeout: 60000 // 60 second timeout
      });

      console.log(`✅ Successfully cloned ${repoName}`);

      res.json({
        success: true,
        name: repoName,
        path: targetPath,
        message: `Successfully cloned ${repoName}`
      });
    } catch (cloneError) {
      console.error(`❌ Git clone failed:`, cloneError.message);

      // Clean up partial clone if it exists
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }

      return res.status(500).json({
        error: 'Clone failed',
        message: cloneError.message
      });
    }

  } catch (error) {
    console.error('Error cloning repository:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Workspace identification endpoint - creates/reads .labcart/workspace.json
app.post('/workspace/identify', async (req, res) => {
  try {
    const { workspacePath } = req.body;

    if (!workspacePath || typeof workspacePath !== 'string') {
      return res.status(400).json({
        error: 'Workspace path is required'
      });
    }

    const fs = require('fs');
    const path = require('path');
    const { randomUUID } = require('crypto');

    // Verify the workspace path exists
    if (!fs.existsSync(workspacePath)) {
      return res.status(404).json({
        error: 'Workspace path does not exist'
      });
    }

    // Check if it's a directory
    const stats = fs.statSync(workspacePath);
    if (!stats.isDirectory()) {
      return res.status(400).json({
        error: 'Workspace path must be a directory'
      });
    }

    const labcartDir = path.join(workspacePath, '.labcart');
    const workspaceFile = path.join(labcartDir, 'workspace.json');

    let workspaceId;
    let isNew = false;

    // Check if .labcart/workspace.json exists
    if (fs.existsSync(workspaceFile)) {
      // Read existing workspace ID
      try {
        const fileContent = fs.readFileSync(workspaceFile, 'utf8');
        const data = JSON.parse(fileContent);

        if (data.workspaceId && typeof data.workspaceId === 'string') {
          workspaceId = data.workspaceId;
          console.log(`🔵 Workspace identified: ${workspaceId} at ${workspacePath}`);
        } else {
          // Invalid format - regenerate
          throw new Error('Invalid workspace.json format');
        }
      } catch (error) {
        console.error('Error reading workspace.json:', error);
        // File is corrupted - regenerate
        workspaceId = randomUUID();
        isNew = true;
      }
    } else {
      // New workspace - generate UUID
      workspaceId = randomUUID();
      isNew = true;
      console.log(`🟢 New workspace created: ${workspaceId} at ${workspacePath}`);
    }

    // Create or update the .labcart directory and workspace.json
    if (isNew) {
      // Create .labcart directory if it doesn't exist
      if (!fs.existsSync(labcartDir)) {
        fs.mkdirSync(labcartDir, { recursive: true });
      }

      // Write workspace.json
      const workspaceData = {
        workspaceId,
        createdAt: new Date().toISOString(),
        path: workspacePath,
      };

      fs.writeFileSync(workspaceFile, JSON.stringify(workspaceData, null, 2), 'utf8');

      // Create .gitignore if it doesn't exist
      const gitignorePath = path.join(labcartDir, '.gitignore');
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, '# LabCart workspace metadata\n*\n', 'utf8');
      }

      console.log(`✓ Created .labcart/workspace.json`);
    }

    res.json({
      success: true,
      workspaceId,
      workspacePath,
      isNew,
    });

  } catch (error) {
    console.error('Error identifying workspace:', error);
    res.status(500).json({
      error: 'Failed to identify workspace',
      message: error.message
    });
  }
});

// File system listing endpoint
app.get('/files', (req, res) => {
  try {
    const workspacePath = req.query.workspace || process.cwd();
    const dirPath = req.query.path || workspacePath;

    // Security: Ensure we're only reading from the workspace
    const normalizedPath = path.normalize(dirPath);
    const normalizedWorkspace = path.normalize(workspacePath);
    if (!normalizedPath.startsWith(normalizedWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const items = fs.readdirSync(normalizedPath, { withFileTypes: true });

    const files = items.map(item => ({
      name: item.name,
      path: path.join(normalizedPath, item.name),
      isDirectory: item.isDirectory(),
      isFile: item.isFile(),
    }))
    .filter(item => !item.name.startsWith('.')) // Hide hidden files
    .sort((a, b) => {
      // Directories first, then files, alphabetically
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ files, path: normalizedPath });
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

// Read individual file endpoint
app.get('/read-file', (req, res) => {
  try {
    const workspacePath = req.query.workspace || process.cwd();
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'Path required' });
    }

    // Security: Ensure we're only reading from the workspace
    const normalizedPath = path.normalize(filePath);
    const normalizedWorkspace = path.normalize(workspacePath);
    if (!normalizedPath.startsWith(normalizedWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    const content = fs.readFileSync(normalizedPath, 'utf-8');
    res.json({ content, path: normalizedPath });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// File system watching endpoint (Server-Sent Events)
app.get('/files/watch', (req, res) => {
  const workspacePath = req.query.workspace || process.cwd();
  const dirPath = req.query.path || workspacePath;

  if (!dirPath) {
    return res.status(400).send('Path is required');
  }

  if (!fs.existsSync(dirPath)) {
    return res.status(404).send('Directory does not exist');
  }

  // Security check
  const normalizedPath = path.normalize(dirPath);
  const normalizedWorkspace = path.normalize(workspacePath);
  if (!normalizedPath.startsWith(normalizedWorkspace)) {
    return res.status(403).send('Access denied');
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Watch the directory for changes
  const watcher = fs.watch(normalizedPath, { recursive: false }, (eventType, filename) => {
    if (filename) {
      console.log(`File system change detected: ${eventType} - ${filename}`);
      const event = {
        type: 'change',
        eventType,
        filename,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });

  // Handle client disconnect
  req.on('close', () => {
    watcher.close();
    console.log(`Stopped watching: ${normalizedPath}`);
  });
});

// Bot sync endpoint - Sync bots from database to bots.json
app.post('/sync-bots', async (req, res) => {
  try {
    const userId = process.env.USER_ID;
    const coordinationUrl = process.env.COORDINATION_URL?.replace('/register', '') || 'http://localhost:3000/api';

    if (!userId) {
      return res.status(400).json({ error: 'USER_ID not configured' });
    }

    console.log(`📡 Syncing bots from database for user ${userId}...`);

    // Fetch bots from database
    const response = await fetch(`${coordinationUrl}/bots?userId=${userId}`);

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to fetch bots: ${error}`);
      return res.status(500).json({ error: 'Failed to fetch bots from database' });
    }

    const data = await response.json();
    const bots = data.bots || [];

    // Convert database format to bots.json format
    const botsConfig = bots
      .filter(bot => bot.active)
      .map(bot => ({
        id: bot.id,
        name: bot.name,
        systemPrompt: bot.system_prompt,
        workspace: bot.workspace || '/opt/lab/claude-bot',
        webOnly: bot.web_only,
        token: bot.telegram_token,
        active: bot.active,
      }));

    // Write to bots.json
    const botsConfigPath = path.join(__dirname, 'bots.json');
    fs.writeFileSync(botsConfigPath, JSON.stringify(botsConfig, null, 2));

    console.log(`✅ Synced ${botsConfig.length} bots to bots.json`);

    res.json({
      success: true,
      synced: botsConfig.length,
      bots: botsConfig,
    });

  } catch (error) {
    console.error('Error syncing bots:', error);
    res.status(500).json({ error: 'Failed to sync bots', message: error.message });
  }
});

httpServer.listen(HTTP_PORT, async () => {
  console.log(`\n🌐 HTTP Server listening on port ${HTTP_PORT}`);
  console.log(`   POST /trigger-bot - External delegation endpoint`);
  console.log(`   POST /resolve-workspace - Workspace folder resolution`);
  console.log(`   GET  /health      - Health check`);
  console.log(`   WebSocket enabled for UI connections\n`);

  // Register with coordination API
  await registerServer();

  // Connect to WebSocket proxy for remote IDE connections
  await connectToProxy();
});

// Graceful shutdown handlers
const shutdown = async () => {
  console.log('\n\n🛑 Received shutdown signal...');
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
