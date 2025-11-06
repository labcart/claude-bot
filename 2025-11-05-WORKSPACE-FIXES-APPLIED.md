# Workspace Path Fixes Applied - 2025-11-05 22:17

## Summary
Fixed critical issues where workspace paths were not being saved to session metadata and where history loading was broken due to hardcoded workspace paths.

## Problems Identified

### 1. Web UI Sessions Not Saving Workspace Path
**Issue**: Sessions created through LabCart UI had `workspacePath: null` despite workspace being passed from frontend.

**Root Cause**: The WebSocket handler in [server.js:625](server.js#L625) was calling `setCurrentUuid()` without the workspace parameter.

**Fix Applied**: Updated line 625 to pass workspace parameter:
```javascript
const workspace = workspacePath || process.env.LABCART_WORKSPACE || process.cwd();
manager.sessionManager.setCurrentUuid(botId, userId, sessionUuid, workspace);
```

### 2. History Loading Broken - Hardcoded Workspace Path
**Issue**: When clicking old conversations in UI, they weren't loading. All conversations from `/opt/lab` were invisible.

**Root Cause**: Two locations had hardcoded `/opt/lab/claude-bot` path:
1. [server.js:473](server.js#L473) - `/all-sessions` endpoint
2. [bot-manager.js:1647](lib/bot-manager.js#L1647) - `readSessionMessages()` function

**Fix Applied**:
- Updated `/all-sessions` endpoint to accept `workspace` query parameter
- Updated `readSessionMessages()` to accept `workspacePath` parameter
- Both now dynamically convert workspace path to Claude project directory name

Example:
- `/opt/lab` → `~/.claude/projects/-opt-lab/`
- `/opt/lab/claude-bot` → `~/.claude/projects/-opt-lab-claude-bot/`

### 3. Telegram Bots Not Passing Workspace
**Issue**: Already fixed in previous commit, but documented here for completeness.

**Fix Applied**: Updated [bot-manager.js](lib/bot-manager.js) at lines 474, 503, 556, 582, 1427 to pass `workspace` from bot config.

## Files Modified

### [server.js](server.js)
1. **Line 625-627**: Added workspace parameter when saving session UUID for web UI
2. **Line 473-479**: Updated `/all-sessions` endpoint to accept workspace query parameter
3. **Line 534**: Updated `/messages/:sessionUuid` endpoint to accept workspace query parameter

### [lib/bot-manager.js](lib/bot-manager.js)
1. **Line 1640**: Updated `readSessionMessages()` signature to accept `workspacePath` parameter
2. **Line 1646-1652**: Dynamic workspace directory resolution instead of hardcoded path

### [bots.json](bots.json)
1. Added `"workspace": "/opt/lab/claude-bot"` to all 13 bot configurations

## Testing Required

### Test Case 1: New Session with Workspace
1. Open LabCart from `/opt/lab` workspace
2. Send message to any bot
3. Check session metadata file - should have `"workspacePath": "/opt/lab"`

### Test Case 2: History Loading
1. Open LabCart from `/opt/lab` workspace
2. Click on session history dropdown
3. Should see conversations from `/opt/lab` workspace only
4. Click on old conversation - should load messages correctly

### Test Case 3: Workspace Isolation
1. Open LabCart from `/opt/lab/claude-bot` workspace
2. Should see different set of conversations than `/opt/lab`
3. Each workspace should be completely isolated

## Expected API Usage

### Frontend must pass workspace in:
1. **WebSocket messages**: `{ botId, userId, message, workspacePath }`
2. **GET /all-sessions**: `?workspace=/opt/lab`
3. **GET /messages/:uuid**: `?workspace=/opt/lab`
4. **POST /switch-session**: (uses session metadata's saved workspace)

## Migration Status

- ✅ Old sessions migrated with workspace paths from conversation files
- ✅ New sessions will save workspace correctly
- ✅ History loading now workspace-aware
- ⚠️ Frontend must be updated to pass workspace in API calls

## Next Steps

1. Update LabCart frontend to pass workspace parameter in all API calls
2. Test workspace isolation thoroughly
3. Consider adding workspace validation (reject if workspace doesn't exist)
4. Add workspace to session list UI so user can see which workspace each session belongs to
