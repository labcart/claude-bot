# Workspace Selection Architecture

This document explains how workspace selection works in the claude-bot platform.

## Overview

The system supports two different modes with different workspace handling:

1. **Web UI Mode** - Workspace is dynamic, selected per-message from the frontend
2. **Telegram Mode** - Workspace is static, configured in `bots.json`

## Web UI Mode (LabCart)

### How It Works

```
User selects workspace in UI
         ↓
Stored in browser localStorage (useWorkspaceStore)
         ↓
Sent WITH EVERY MESSAGE via WebSocket
socket.emit('send-message', { botId, userId, message, workspacePath })
         ↓
Server extracts workspace from message
const { workspacePath } = data;
         ↓
Passed to Claude CLI
claudeCmd --ide --resume sessionId (runs in workspacePath directory)
```

### Key Points

- ✅ **Workspace is NEVER hardcoded** - it comes from the UI with each message
- ✅ **Each user can use different workspaces** - per-message basis
- ✅ **Workspace can change mid-conversation** - just select a different one in UI
- ❌ **bots.json workspace is IGNORED** - the `workspace` field in bots.json is not used
- ❌ **Database workspace is IGNORED** - the `workspace` field in Supabase is not used

### Source of Truth

**For Web UI users, the ONLY source of workspace is:**
- `useWorkspaceStore` in the frontend (React Zustand store)
- Stored in browser `localStorage` under key `labcart-workspace`
- Sent to server via WebSocket message payload

## Telegram Mode

### How It Works

```
bots.json contains workspace configuration
         ↓
Server reads on startup
         ↓
Workspace is static for that bot
         ↓
All users of that Telegram bot use same workspace
```

### Key Points

- ✅ **bots.json workspace IS used** - this is the only source of workspace
- ⚠️ **Workspace is static** - same for all users of that bot
- ⚠️ **To change workspace** - must edit bots.json and restart server

### Source of Truth

**For Telegram users, the source of workspace is:**
- `bots.json` file on the server
- Read once at server startup
- Configured manually or via init-bots.js

## Bot Initialization

### init-bots.js Script

**Purpose:** Upload local brain files to Supabase database

**What it does:**
1. Scans `/brains` folder for personality files
2. Creates bot records in Supabase database
3. ~~Generates bots.json~~ (deprecated for Web UI)

**What it does NOT do:**
- ❌ Set workspace for Web UI (workspace comes from UI)
- ❌ Required for server startup (server fetches from Supabase)
- ❌ Configure actual workspace behavior

**When to run:**
- First time setup (to upload brains to database)
- When you add new brain files
- ⚠️ Not needed for day-to-day operation

### Server Startup

**Web UI Mode:**
```javascript
if (USER_ID && COORDINATION_URL) {
  // Fetch bots from Supabase
  const response = await fetch(`${COORDINATION_URL}/bots?userId=${USER_ID}`);
  bots = response.bots;
}
```

**Telegram Mode:**
```javascript
else {
  // Read from bots.json
  bots = JSON.parse(fs.readFileSync('bots.json'));
}
```

## Common Misconceptions

### ❌ "The workspace in bots.json is used by Web UI"
**FALSE.** Web UI completely ignores bots.json workspace. It comes from the UI.

### ❌ "init-bots.js sets the workspace for Web UI users"
**FALSE.** The workspace set in init-bots.js is stored in the database but never used by Web UI.

### ❌ "You need to run init-bots.js every time you change workspace"
**FALSE.** Just select the new workspace in the Web UI. It's dynamic.

### ❌ "bots.json is required for Web UI"
**FALSE.** Server fetches bots from Supabase. bots.json is only for Telegram mode.

## Workspace Flow Diagrams

### Web UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React)                                            │
│                                                             │
│  User selects workspace → useWorkspaceStore                │
│                    ↓                                        │
│           localStorage: "labcart-workspace"                 │
│                    ↓                                        │
│  socket.emit('send-message', { workspacePath: "/path" })   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend (Node.js)                                           │
│                                                             │
│  socket.on('send-message', (data) => {                     │
│    const { workspacePath } = data;  ← FROM UI              │
│    claudeClient.spawn({ cwd: workspacePath })              │
│  })                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Claude CLI                                                  │
│                                                             │
│  Runs in workspace directory                               │
│  Stores conversation in ~/.claude/projects/{workspace}/    │
└─────────────────────────────────────────────────────────────┘
```

### Telegram Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Configuration (bots.json)                                   │
│                                                             │
│  {                                                          │
│    "id": "mybot",                                          │
│    "workspace": "/opt/lab/myproject" ← HARDCODED           │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend (Node.js)                                           │
│                                                             │
│  bot.on('message', (msg) => {                              │
│    const workspace = botInfo.config.workspace;             │
│    claudeClient.spawn({ cwd: workspace })                  │
│  })                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Claude CLI                                                  │
│                                                             │
│  Runs in workspace directory                               │
│  Same workspace for all users                              │
└─────────────────────────────────────────────────────────────┘
```

## Summary

| Feature | Web UI Mode | Telegram Mode |
|---------|------------|---------------|
| **Workspace Source** | UI (per-message) | bots.json (static) |
| **Can Change** | ✅ Yes, anytime | ⚠️ Requires restart |
| **Per-User** | ✅ Yes | ❌ No (shared) |
| **bots.json Used** | ❌ No | ✅ Yes |
| **Database Used** | ✅ Yes (for brains) | ❌ Optional |

## Environment Variables

### Web UI Mode
```bash
USER_ID=your-uuid                           # Required
COORDINATION_URL=https://labcart.io/api     # Required
NEXT_PUBLIC_SUPABASE_URL=https://...        # Optional (for BrainLoader)
SUPABASE_SERVICE_ROLE_KEY=...               # Optional (for BrainLoader)
```

### Telegram Mode
```bash
# No env vars required
# All config in bots.json
```

## Troubleshooting

### "My workspace changes aren't reflected"

**For Web UI:**
- Check browser localStorage: `labcart-workspace`
- Verify workspace is sent in WebSocket message
- Check server logs for `workspace:` in message handler

**For Telegram:**
- Edit bots.json
- Restart server
- Verify correct workspace in logs

### "Server says no bots found"

**For Web UI:**
- Run `node scripts/init-bots.js` to create bots in database
- Check USER_ID and COORDINATION_URL are set in .env
- Verify bots exist in Supabase

**For Telegram:**
- Create bots.json file
- See bots.json.example for format

### "Workspace in database doesn't match what I'm using"

**This is normal for Web UI!** The database workspace is not used. Workspace comes from the UI.
