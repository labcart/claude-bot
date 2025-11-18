#!/usr/bin/env node

/**
 * Chat Context HTTP Service (Standalone)
 *
 * Self-contained HTTP server that provides chat context/session retrieval.
 * Runs once globally and serves all MCP Router instances.
 *
 * Reads local Cursor/Claude Code SQLite databases
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import from local dist directory
import { CursorContext } from './dist/core/index.js';
import {
  handleListSessions,
  handleSearchSessions,
  handleGetSession,
  handleNicknameCurrentSession,
  handleAddTag,
  handleRemoveTag,
  handleSyncSessions,
  handleListTags,
  handleListProjects
} from './dist/mcp-server/tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('💬 Chat Context HTTP Service starting...');

// Initialize Cursor Context API (reused across requests)
const api = new CursorContext();

// Create Express app
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  const stats = api.getStats();
  res.json({
    status: 'healthy',
    stats: {
      totalSessionsInCursor: stats.totalSessionsInCursor || 0,
      totalSessionsWithMetadata: stats.totalSessionsWithMetadata || 0,
      totalProjects: stats.totalProjects || 0,
      totalTags: stats.totalTags || 0
    }
  });
});

// Get tool schema (for MCP Router to register)
app.get('/schema', (req, res) => {
  res.json([
    {
      name: 'list_sessions',
      description: `**ONLY use this tool when user asks about PAST/OTHER chat sessions - NOT about the current chat or project code!**

TRIGGER PHRASES:
- "Show my past chat sessions"
- "List my previous conversations"
- "What sessions do I have?"
- "Show my chat history"

DO NOT use for: Understanding project code, current conversation, or explaining functionality.
USE this for: Retrieving the user's actual saved Cursor chat session data from their database.`,
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of sessions to return (default: 20)',
          },
          project: {
            type: 'string',
            description: 'Filter by project path (or current workspace path if listing current project)',
          },
          tag: {
            type: 'string',
            description: 'Filter by specific tag',
          },
          taggedOnly: {
            type: 'boolean',
            description: 'Only show sessions with tags/nicknames',
          },
          sort: {
            type: 'string',
            enum: ['newest', 'oldest', 'most_messages'],
            description: 'Sort order (default: newest)',
          },
          source: {
            type: 'string',
            enum: ['cursor', 'claude', 'all'],
            description: 'Filter by source (cursor, claude, or all) (default: all)',
          },
        },
      },
    },
    {
      name: 'search_sessions',
      description: `**ONLY use this tool to search the user's PAST chat sessions - NOT to understand project code!**

TRIGGER PHRASES:
- "Search my past chats for [topic]"
- "Find a previous conversation about [X]"
- "I discussed [X] before, find that chat"
- "Look in my old sessions for [X]"

DO NOT use for: Reading code, understanding the current chat, or explaining the project.
USE this for: Searching through saved chat session data for specific topics the user mentioned in PAST conversations.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          project: {
            type: 'string',
            description: 'Limit search to specific project',
          },
          taggedOnly: {
            type: 'boolean',
            description: 'Only search sessions with tags',
          },
          limit: {
            type: 'number',
            description: 'Maximum results (default: 10)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_session',
      description: `**ONLY use this to retrieve a specific PAST chat session by ID or nickname.**

TRIGGER PHRASES:
- "Show me session [ID/nickname]"
- "Load my '[nickname]' chat"
- "Get the full conversation for session [ID]"

USE this after search_sessions finds a session, or when user provides a session ID/nickname.`,
      inputSchema: {
        type: 'object',
        properties: {
          idOrNickname: {
            type: 'string',
            description: 'Session ID (UUID) or nickname',
          },
          maxMessages: {
            type: 'number',
            description: 'Maximum messages to include (default: 50)',
          },
          format: {
            type: 'string',
            enum: ['markdown', 'json'],
            description: 'Output format (default: markdown)',
          },
        },
        required: ['idOrNickname'],
      },
    },
    {
      name: 'nickname_current_session',
      description: `Set a nickname for the CURRENT chat session you are in right now.

Use when user wants to name THIS session:
- "Nickname this chat 'auth-implementation'"
- "Name the current session 'bug-fix-cors'"
- "Call this conversation 'database-design'"

The nickname will be applied when this session is synced to the database.`,
      inputSchema: {
        type: 'object',
        properties: {
          nickname: {
            type: 'string',
            description: 'Nickname to assign to the current session',
          },
          project: {
            type: 'string',
            description: 'Current project/workspace path (automatically provided)',
          },
        },
        required: ['nickname'],
      },
    },
    {
      name: 'add_tag',
      description: `Add tag(s) to a session for organization.

Use when user wants to categorize:
- "Tag this as 'feature' and 'backend'"
- "Add 'bugfix' tag"
- "Categorize this as 'documentation'"`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Session ID (UUID) or nickname',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tag(s) to add',
          },
        },
        required: ['sessionId', 'tags'],
      },
    },
    {
      name: 'remove_tag',
      description: `Remove tag(s) from a session.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Session ID (UUID) or nickname',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tag(s) to remove',
          },
        },
        required: ['sessionId', 'tags'],
      },
    },
    {
      name: 'list_tags',
      description: `**Show all tags used to organize the user's PAST chat sessions.**

TRIGGER: "What tags do I have?" or "Show my chat tags"`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'list_projects',
      description: `**Show all projects that have saved chat sessions.**

TRIGGER: "What projects have I chatted about?" or "Show my session projects"`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'sync_sessions',
      description: `Sync sessions from Cursor and/or Claude Code databases to the metadata database.

Use when user wants to:
- "Sync my sessions"
- "Update the session database"
- "Refresh sessions"
- "Sync the chat sessions"

This will fetch new/updated sessions and make them available for querying.`,
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of sessions to sync (default: all sessions)',
          },
          project: {
            type: 'string',
            description: 'Current project/workspace path (automatically provided)',
          },
          source: {
            type: 'string',
            enum: ['cursor', 'claude', 'all'],
            description: 'Source to sync from (cursor, claude, or all) (default: all)',
          },
        },
      },
    },
  ]);
});

// Execute list_sessions tool
app.post('/list_sessions', async (req, res) => {
  try {
    console.log(`📋 [HTTP] Listing sessions...`);
    const result = await handleListSessions(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] List sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute search_sessions tool
app.post('/search_sessions', async (req, res) => {
  try {
    console.log(`🔍 [HTTP] Searching sessions: "${req.body.query}"`);
    const result = await handleSearchSessions(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] Search sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute get_session tool
app.post('/get_session', async (req, res) => {
  try {
    console.log(`📖 [HTTP] Getting session: ${req.body.idOrNickname}`);
    const result = await handleGetSession(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] Get session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute nickname_current_session tool
app.post('/nickname_current_session', async (req, res) => {
  try {
    console.log(`🏷️  [HTTP] Nicknaming current session: "${req.body.nickname}"`);
    const result = await handleNicknameCurrentSession(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] Nickname session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute add_tag tool
app.post('/add_tag', async (req, res) => {
  try {
    console.log(`🏷️  [HTTP] Adding tag(s) to session: ${req.body.sessionId}`);
    const result = await handleAddTag(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] Add tag error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute remove_tag tool
app.post('/remove_tag', async (req, res) => {
  try {
    console.log(`🏷️  [HTTP] Removing tag(s) from session: ${req.body.sessionId}`);
    const result = await handleRemoveTag(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] Remove tag error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute list_tags tool
app.post('/list_tags', async (req, res) => {
  try {
    console.log(`🏷️  [HTTP] Listing tags...`);
    const result = await handleListTags(api);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] List tags error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute list_projects tool
app.post('/list_projects', async (req, res) => {
  try {
    console.log(`📁 [HTTP] Listing projects...`);
    const result = await handleListProjects(api);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] List projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute sync_sessions tool
app.post('/sync_sessions', async (req, res) => {
  try {
    console.log(`🔄 [HTTP] Syncing sessions...`);
    const result = await handleSyncSessions(api, req.body);
    res.json({ content: result.content[0].text });
  } catch (error) {
    console.error('❌ [HTTP] Sync sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.CHAT_CONTEXT_HTTP_PORT || 3003;
app.listen(PORT, () => {
  console.log(`\n🚀 Chat Context HTTP Service running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Schema: http://localhost:${PORT}/schema`);
  console.log(`\n📦 This is a SHARED service - one instance serves all bots\n`);
});
