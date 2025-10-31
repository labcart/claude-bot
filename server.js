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
  if (!bot.id || !bot.token || !bot.brain) {
    console.error('❌ Error: Each bot must have id, token, and brain fields');
    console.error('   Invalid bot config:', JSON.stringify(bot, null, 2));
    process.exit(1);
  }
}

// Create bot manager
const manager = new BotManager({
  claudeCmd: process.env.CLAUDE_CMD || 'claude'
});

// Add each bot
console.log('🚀 Loading bots...\n');

for (const bot of bots) {
  try {
    manager.addBot(bot);
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

// Initialize Nudge Manager
const nudgeManager = new NudgeManager(
  manager,
  manager.sessionManager,
  process.env.CLAUDE_CMD || 'claude'
);

// Graceful shutdown handlers
const shutdown = async () => {
  console.log('\n\n🛑 Received shutdown signal...');
  nudgeManager.stop();
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
