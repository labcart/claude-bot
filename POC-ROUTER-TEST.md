# MCP Router POC Test Instructions

## What We Built

**Before (Current Production):**
- Each Claude CLI conversation spawns: 1 Claude CLI + 7 MCP child processes = 8 processes
- 100 concurrent users = 800 processes

**After (New Router Architecture):**
- Each Claude CLI conversation spawns: 1 Claude CLI + 1 lightweight MCP Router = 2 processes
- MCP Router routes to shared HTTP services (5 services run globally, shared by all users)
- 100 concurrent users = 200 processes + 5 services = 205 total (**75% reduction!**)

## Architecture

```
Telegram Bot (MattyAtlas)
    ↓
Claude CLI Session (--strict-mcp-config)
    ↓
MCP Router (stdio) ← One lightweight router per conversation
    ↓ (HTTP)
TTS HTTP Service (port 3001) ← Shared globally, one instance total
```

## Services Running

1. **TTS HTTP Service** (PID: Check with `ps aux | grep tts-http`)
   - Port: 3001
   - Location: `/Users/macbook/play/tts-http-service/`
   - Status: Check with `curl http://localhost:3001/health`

2. **Bot Server** (PID: Check with `ps aux | grep "node server.js"`)
   - Location: `/Users/macbook/play/claude-bot/`
   - Logs: `/tmp/bot-server.log`

## How to Test

### Test 1: Verify TTS HTTP Service

```bash
# Health check
curl http://localhost:3001/health

# Should return:
# {"status":"healthy","providers":["google","openai","elevenlabs"],"defaultProvider":"openai"}

# Check schema
curl http://localhost:3001/schema | python3 -m json.tool
```

### Test 2: Send a TTS Request via Telegram

**Send this message to MattyAtlas bot:**

```
Generate a voice message saying "Hello, this is a test of the new router architecture"
```

**What should happen:**
1. Bot receives message
2. Spawns Claude CLI with `--strict-mcp-config` (only loads MCP Router)
3. MCP Router starts (lightweight, ~30MB RAM)
4. Claude decides to call `text_to_speech` tool
5. Router forwards request to `http://localhost:3001/text_to_speech`
6. TTS HTTP Service generates audio
7. Returns audio path to bot
8. Bot sends voice message to Telegram

### Test 3: Monitor Process Count

**Before sending message:**
```bash
# Count Claude/Node processes
ps aux | grep -E "(node|claude)" | grep -v grep | wc -l
```

**Send Telegram message to trigger conversation**

**After Claude processes message:**
```bash
# Check processes again
ps aux | grep -E "(node|claude)" | grep -v grep | wc -l

# Look for mcp-router process
ps aux | grep mcp-router
```

**Expected difference:**
- OLD: +7 processes (all MCPs loaded)
- NEW: +1 process (just mcp-router)

### Test 4: Check Router Logs

**Watch bot server logs:**
```bash
tail -f /tmp/bot-server.log
```

**Look for:**
- `🚀 Spawning (simple): claude --strict-mcp-config --mcp-config {...}`
- Router should be only MCP loaded

**Watch TTS service logs:**
```bash
tail -f /tmp/tts-http.log
```

**Look for:**
- `🎤 [HTTP] Generating speech with openai: ...`
- `✅ [HTTP] Audio generated: ...`

## Rollback Instructions

If POC doesn't work, rollback to original setup:

```bash
# 1. Stop bot server
pkill -f "node server.js"

# 2. Restore original claude-client.js
cd /Users/macbook/play/claude-bot
git diff lib/claude-client.js
# Remove the --strict-mcp-config and --mcp-config lines (lines 78-88)
# Restore to original (lines 73-78 only)

# 3. Restart bot server
npm start
```

## Backup Locations

- **Original TTS MCP:** `/Users/macbook/play/TTS-mcp-BACKUP/`
- **Modified claude-client.js:** Check `git diff lib/claude-client.js`

## Success Criteria

✅ Bot responds to TTS requests
✅ Audio messages are generated
✅ Process count is lower (only +2 instead of +8 per conversation)
✅ Router forwards to HTTP service correctly
✅ No errors in logs

## Troubleshooting

**Problem: "Tool text_to_speech not found"**
- Check TTS HTTP service is running: `curl http://localhost:3001/health`
- Check router can fetch schema: Router logs should show "✅ Registered X total tools"

**Problem: Router not starting**
- Check dependencies: `cd /Users/macbook/play/mcp-router && npm install`
- Test manually: `node /Users/macbook/play/mcp-router/index.js`

**Problem: HTTP service errors**
- Check TTS service logs: `tail -f /tmp/tts-http.log`
- Verify OpenAI API key is set in TTS-mcp config

## Next Steps After Successful POC

1. Convert image-gen-mcp to HTTP service (port 3002)
2. Add image-gen to router configuration
3. Test image generation
4. Convert remaining MCPs (playwright, notebooklm, cursor-context)
5. Monitor production metrics
