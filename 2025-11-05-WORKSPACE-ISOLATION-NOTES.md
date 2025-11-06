# Workspace Isolation - Conversation Storage

**Last Updated:** 2025-11-05

## Key Understanding: Claude Conversation Storage

### Single Storage Location
Both IDE and CLI conversations are stored in **the same location structure**:
- Location: `~/.claude/projects/<workspace-name>/`
- Example: `/opt/lab` → `~/.claude/projects/-opt-lab/`
- Example: `/opt/lab/claude-bot` → `~/.claude/projects/-opt-lab-claude-bot/`

### Two Ways to Create Conversations
1. **IDE (Claude Code Extension)**: When using Claude directly in VS Code/Cursor
2. **CLI (Bot Server)**: When Telegram bot calls `claude` command

**Important:** The filesystem doesn't care HOW Claude was invoked, only WHERE (the `cwd` - current working directory).

### Current Issue (as of 2025-11-05)

**Problem:** Bot is not passing `workspacePath` when saving session metadata.

**Location:** `/opt/lab/claude-bot/lib/bot-manager.js`

**Current Code:**
```javascript
this.sessionManager.setCurrentUuid(botId, msg.from.id, claudeUuid);
```

**Should Be:**
```javascript
this.sessionManager.setCurrentUuid(botId, msg.from.id, claudeUuid, workspacePath);
```

**Impact:** New bot sessions won't have workspace tracking, breaking workspace isolation in LabCart UI.

**Fix Required:**
1. Add `workspace` field to bot configuration
2. Pass workspace path through bot-manager → session-manager
3. Ensure claude-client continues to set `cwd` when spawning Claude

**Status:** Not yet fixed - needs implementation before creating new bot sessions.
