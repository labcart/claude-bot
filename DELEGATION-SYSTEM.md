# Delegation System - Technical Implementation

**Created:** November 2, 2025
**Status:** ✅ Phase 2 Complete (Structured Callbacks Working)
**Last Updated:** November 2, 2025

> **Note:** For high-level architecture and vision, see [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Overview

The delegation system enables structured communication between AI agents (bots) and external sessions (IDE, CLI). This document covers the technical implementation details.

**Key capabilities:**
- Bot-to-bot delegation (via Telegram `/team` command)
- IDE-to-bot delegation (via MCP tool)
- Structured callbacks (YES/NO responses with reasoning)
- Multi-bot consensus (parallel queries with conditional logic)

---

## Core Concept

**What it does:**
- User types `/team @botname task description` in any bot's chat
- System captures last N messages from current conversation
- Sends those messages + task to target bot's session
- Target bot responds in their own chat with full context

**What it does NOT do:**
- ❌ Does not swap/move sessions between bots
- ❌ Does not track non-bot Claude sessions (VSCode, CLI)
- ❌ Does not merge sessions or create shared sessions

---

## Architecture

### Current Infrastructure (Already Built)

```javascript
// We already have:
✅ SessionManager - tracks bot sessions per (botId, userId)
✅ sendToClaudeSession() - invokes any bot's session
✅ Telegram message routing
✅ Bot registry (8 active bots)
```

### What We're Adding

```javascript
// New additions:
1. Command detection: if (msg.text.startsWith('/team'))
2. Bot tag parsing: extract @botname mentions
3. Context retrieval: getRecentMessages(botId, userId, limit)
4. Delegation routing: forward to target bot with context
```

---

## Use Cases

### Use Case 1: Bot-to-Bot Delegation (Telegram)

**Scenario:** User is chatting with MattyAtlas, wants Finn to help with coding

```
User in MattyAtlas chat:
"We need to build an OAuth authentication system. /team @finnshipley implement this"

What happens:
1. MattyAtlas detects /team command
2. Extracts target: finnshipley
3. Gets last 5 messages from MattyAtlas chat
4. Sends to Finn's session:

   [TEAM REQUEST FROM MATTYATLAS]
   User: Bryan
   Task: implement this

   Recent context from MattyAtlas:
   - User: "We need to build an OAuth authentication system"
   - MattyAtlas: "I recommend using OAuth 2.0 with Google and GitHub providers..."
   - User: "What about security?"
   - MattyAtlas: "Use PKCE for mobile apps, store tokens in httpOnly cookies..."

   Please implement this system.

5. Finn responds in Finn's Telegram chat with implementation
```

---

### Use Case 2: Multi-Bot Collaboration

**Scenario:** User wants input from multiple bots

```
User in MattyAtlas chat:
"/team @finnshipley @priest review this architecture for technical quality and ethical implications"

What happens:
1. Context sent to BOTH Finn and Priest
2. Finn responds in Finn's chat (technical review)
3. Priest responds in Priest's chat (ethical review)
4. User gets multiple perspectives
```

---

### Use Case 3: VSCode/Claude Code → Bot (Phase 2)

**Scenario:** User in regular Claude session wants to invoke a bot

```
User in THIS session (VSCode):
"Send this conversation to Finn and ask him to build the /team feature"

Claude (assistant in this session):
1. Calls MCP tool: delegate_to_bot("finnshipley", "build the /team feature")
2. MCP tool extracts last 15 messages from THIS conversation (already in LLM context)
3. Sends to HTTP endpoint: POST /trigger-bot with messages array
4. Bot server receives request, calls delegateToBot() (same logic as bot-to-bot)
5. Finn gets context and responds on Telegram

✅ WORKS - no need to track this VSCode session
```

**Why it works without tracking:**
- LLM (me) already has conversation in context - just extract and send
- MCP tool POSTs to HTTP endpoint with messages array
- Bot server uses SAME delegation logic as bot-to-bot
- Later: When web version tracks ALL sessions, we'll read from files instead of LLM context
- This is a temporary bridge until centralized session tracking exists

**MCP Architecture Note:**
- **IDE session uses STDIO MCP** (cursor-context with delegate_to_bot tool)
  - Single human session, low volume
  - Direct stdio connection is fine for one-off manual operations
  - Tool lives in `/opt/lab/chat-context-mcp/dist/mcp-server/`
- **Bot sessions use HTTP MCP** (via MCP Router → chat-context-http)
  - Many concurrent bot sessions, high volume
  - Lightweight HTTP routing for efficiency
  - Service runs at `http://localhost:3003`
- **Future (headless/web):** Everything routes through HTTP for consistency

---

## Implementation Details

### 1. Command Parsing

```javascript
// In lib/bot-manager.js, handleMessage() function

async handleMessage(msg, botId) {
  // Check for /team command BEFORE normal processing
  if (msg.text && msg.text.startsWith('/team')) {
    return this.handleTeamCommand(msg, botId);
  }

  // ... rest of normal message handling
}
```

---

### 2. Team Command Handler

```javascript
async handleTeamCommand(msg, sourceBotId) {
  const userId = msg.from.id;
  const text = msg.text;

  // Parse: "/team @finn @priest task description here"
  const botMentions = text.match(/@(\w+)/g) || [];
  const targetBots = botMentions.map(m => m.slice(1).toLowerCase());

  // Extract task (everything after /team, minus @mentions)
  const task = text
    .replace('/team', '')
    .replace(/@\w+/g, '')
    .trim();

  if (targetBots.length === 0) {
    // Send help message
    await this.sendTelegramMessage(sourceBotId, userId,
      "Usage: /team @botname task description\nAvailable bots: " +
      Array.from(this.bots.keys()).join(', ')
    );
    return;
  }

  // Get recent context from source bot
  const recentMessages = await this.getRecentMessages(sourceBotId, userId, 5);

  // Build context message
  const contextMsg = this.buildDelegationMessage(
    sourceBotId,
    msg.from.username || msg.from.first_name,
    task,
    recentMessages
  );

  // Send to each target bot
  for (const targetBotId of targetBots) {
    await this.delegateToBot(targetBotId, userId, contextMsg);
  }

  // Confirm to user in source bot's chat
  await this.sendTelegramMessage(sourceBotId, userId,
    `✅ Task delegated to: ${targetBots.map(b => '@' + b).join(', ')}`
  );
}
```

---

### 3. Context Retrieval

```javascript
async getRecentMessages(botId, userId, limit = 5) {
  // Option A: Read from Claude session file directly
  const sessionId = this.sessionManager.getCurrentUuid(botId, userId);
  if (!sessionId) {
    return [];
  }

  const sessionPath = path.join(
    process.env.HOME,
    '.claude/projects/-opt-lab-claude-bot',
    `${sessionId}.jsonl`
  );

  if (!fs.existsSync(sessionPath)) {
    return [];
  }

  const lines = fs.readFileSync(sessionPath, 'utf8')
    .trim()
    .split('\n')
    .filter(line => line.trim());

  // Get last N*2 lines (user + assistant pairs)
  const recentLines = lines.slice(-(limit * 2));

  const messages = recentLines.map(line => {
    try {
      const entry = JSON.parse(line);
      const role = entry.message?.role || 'unknown';
      const content = entry.message?.content || '';

      // Extract text from content (might be string or array)
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.find(c => c.type === 'text')?.text || ''
          : '';

      return { role, text };
    } catch (err) {
      return null;
    }
  }).filter(m => m && m.text);

  return messages;
}

// Option B: Keep in-memory message buffer (simpler but requires state)
// This would require tracking messages as they're sent/received
```

---

### 4. Delegation Message Formatting

```javascript
buildDelegationMessage(sourceBotId, username, task, recentMessages) {
  const sourceBot = sourceBotId.toUpperCase();

  let contextSection = '';
  if (recentMessages.length > 0) {
    contextSection = '\n\nRecent context from ' + sourceBot + ':\n' +
      recentMessages.map(m => {
        const prefix = m.role === 'user' ? 'User' : sourceBot;
        return `- ${prefix}: ${m.text.slice(0, 200)}${m.text.length > 200 ? '...' : ''}`;
      }).join('\n');
  }

  return `
╔════════════════════════════════════════╗
║  TEAM REQUEST FROM ${sourceBot.padEnd(20)} ║
╚════════════════════════════════════════╝

User: ${username}
Task: ${task}
${contextSection}

Please respond to this request.
`.trim();
}
```

---

### 5. Bot Delegation

```javascript
async delegateToBot(targetBotId, userId, message) {
  const targetBot = this.bots.get(targetBotId);

  if (!targetBot) {
    console.error(`❌ Target bot not found: ${targetBotId}`);
    return;
  }

  const targetSessionId = this.sessionManager.getCurrentUuid(targetBotId, userId);

  if (!targetSessionId) {
    console.error(`❌ No session found for ${targetBotId} + user ${userId}`);
    return;
  }

  // Use existing sendToClaudeSession - IT ALREADY WORKS!
  const result = await sendToClaudeSession({
    message,
    sessionId: targetSessionId,
    claudeCmd: this.claudeCmd,
    botId: targetBotId,
    telegramUserId: userId,
    chatId: targetBot.chatId,
    statusMsgId: null, // Don't show "thinking..." status for delegations
    onStream: (chunk) => {
      // Stream response to target bot's chat
      // (handled by existing streaming logic)
    }
  });

  console.log(`✅ Delegated to ${targetBotId}: ${result.success ? 'success' : 'failed'}`);
}
```

---

### 6. Helper: Send Telegram Message

```javascript
async sendTelegramMessage(botId, userId, text) {
  const bot = this.bots.get(botId);
  if (!bot || !bot.telegram) return;

  try {
    await bot.telegram.sendMessage(userId, text);
  } catch (err) {
    console.error(`Failed to send message to ${botId}:`, err.message);
  }
}
```

---

## File Changes

### Modified Files

**`lib/bot-manager.js`**
- Add `handleTeamCommand()` method
- Add `getRecentMessages()` method
- Add `buildDelegationMessage()` method
- Add `delegateToBot()` method
- Add `sendTelegramMessage()` helper
- Modify `handleMessage()` to detect `/team` commands

**Total new code:** ~150 lines

---

## Session Tracking (What We Use vs Don't Use)

### ✅ What We Track (session-manager.js)

```javascript
// Bot sessions per user
{
  'finnshipley-123456': 'abc-123-session-uuid',
  'mattyatlas-123456': 'xyz-456-session-uuid',
  'priest-123456': 'def-789-session-uuid'
}
```

- Tracks: Bot sessions only (Telegram bots)
- Lookup: `sessionManager.getCurrentUuid(botId, userId)`
- Used for: `/team` source and target

### ❌ What We DON'T Track

```javascript
// Regular Claude sessions (VSCode, CLI, Cursor)
// These are NOT tracked by bot-manager
```

- VSCode sessions (like this one)
- CLI sessions
- Cursor sessions
- Non-bot Claude Code sessions

**Why we don't need them:**
- For `/team` to work, we only need to know target bot
- Source can be untracked (we just read its recent messages)
- Target must be tracked (bot session lookup required)

---

## Data Flow Diagram

```
┌─────────────────────────────────────┐
│  User in MattyAtlas Telegram Chat  │
│  "/team @finn build feature X"     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Bot Manager - handleMessage()      │
│  - Detects /team command            │
│  - Parses: target=finn, task=...    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  getRecentMessages(mattyatlas, UID) │
│  - Reads MattyAtlas session file    │
│  - Returns last 5 messages          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  buildDelegationMessage()           │
│  - Formats context + task           │
│  - Creates delegation header        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  delegateToBot(finn, UID, msg)      │
│  - Looks up Finn's session          │
│  - Calls sendToClaudeSession()      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  sendToClaudeSession()              │
│  - Spawns: claude --resume UUID     │
│  - Sends delegation message         │
│  - Streams response to Finn's chat  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Finn's Telegram Chat               │
│  "Here's the implementation..."     │
└─────────────────────────────────────┘
```

---

## Edge Cases & Error Handling

### 1. Target Bot Doesn't Exist
```javascript
if (!this.bots.has(targetBotId)) {
  return sendTelegramMessage(sourceBotId, userId,
    `❌ Bot not found: @${targetBotId}\n` +
    `Available bots: ${Array.from(this.bots.keys()).join(', ')}`
  );
}
```

### 2. No Session for Target Bot
```javascript
const targetSessionId = this.sessionManager.getCurrentUuid(targetBotId, userId);
if (!targetSessionId) {
  return sendTelegramMessage(sourceBotId, userId,
    `⚠️  No active session with @${targetBotId}. Start a conversation first.`
  );
}
```

### 3. Empty Task Description
```javascript
if (!task || task.trim() === '') {
  return sendTelegramMessage(sourceBotId, userId,
    `⚠️  Please provide a task description.\nExample: /team @finn build feature X`
  );
}
```

### 4. User Mentions Non-existent Bot
```javascript
const invalidBots = targetBots.filter(b => !this.bots.has(b));
if (invalidBots.length > 0) {
  return sendTelegramMessage(sourceBotId, userId,
    `❌ Unknown bot(s): ${invalidBots.map(b => '@' + b).join(', ')}\n` +
    `Available: ${Array.from(this.bots.keys()).join(', ')}`
  );
}
```

### 5. Session File Read Fails
```javascript
try {
  const messages = await this.getRecentMessages(botId, userId, 5);
} catch (err) {
  console.error(`Failed to read session for ${botId}:`, err);
  // Continue with empty context - task description is still sent
  messages = [];
}
```

---

## Testing Plan

### Test 1: Basic Bot-to-Bot Delegation
```
1. Start conversation with MattyAtlas
2. Send: "/team @finnshipley write hello world"
3. Verify: Finn's chat receives delegation message
4. Verify: Finn responds with code
5. Verify: MattyAtlas shows confirmation
```

### Test 2: Multi-Bot Delegation
```
1. Chat with MattyAtlas about authentication
2. Send: "/team @finnshipley @priest review this design"
3. Verify: Both Finn and Priest receive context
4. Verify: Both respond in their own chats
```

### Test 3: Context Preservation
```
1. Have 5-message conversation with MattyAtlas
2. Send: "/team @finnshipley implement this"
3. Verify: Finn receives all 5 messages as context
4. Verify: Finn's response references the context
```

### Test 4: Error Handling
```
1. Send: "/team @nonexistentbot do something"
   Expected: Error message with available bots

2. Send: "/team @finn" (no task)
   Expected: Usage help message

3. Send: "/team" (no bot, no task)
   Expected: Usage help message
```

### Test 5: Session Lookup
```
1. Send: "/team @finnshipley test" (no prior Finn conversation)
   Expected: Error - "No active session with @finnshipley"

2. Start conversation with Finn
3. From MattyAtlas: "/team @finnshipley test"
   Expected: Success - message delivered
```

---

## Performance Considerations

### Session File Reading
- **Current approach**: Read full session file, parse JSONL
- **Performance**: Fast for typical sessions (< 100 messages)
- **Optimization**: If sessions grow large (500+ messages), add indexing or summary cache

### Message Limit
- **Default**: Last 5 messages (10 lines of JSONL)
- **Configurable**: Allow users to specify: `/team @finn:10 task` (send last 10 messages)
- **Maximum**: Cap at 20 messages to avoid context overflow

### Multiple Delegations
- **Sequential**: Process one bot at a time
- **Parallel option**: Could parallelize with `Promise.all()`
- **Rate limiting**: Add cooldown between delegations (1-2 seconds)

---

## Security Considerations

### Access Control
- **Current**: Any user can delegate to any bot
- **Future**: Restrict based on `ADMIN_USER_IDS`
- **Implementation**:
```javascript
if (!process.env.ADMIN_USER_IDS.split(',').includes(String(userId))) {
  return sendTelegramMessage(sourceBotId, userId,
    '⛔ /team command is admin-only'
  );
}
```

### Context Leakage
- **Risk**: User A delegates to bot, User B sees context
- **Mitigation**: Sessions are per-user - User B's Finn session is separate
- **Verification**: Ensure `sessionManager.getCurrentUuid(botId, userId)` uses userId

### Session File Access
- **Current**: Read-only access to session files
- **Security**: No risk of corruption (only Claude CLI writes)
- **Permissions**: Session files are user-owned

---

## Future Enhancements

### 1. Configurable Context Size
```javascript
// Allow: /team @finn:15 task (send last 15 messages)
const match = targetBot.match(/^(\w+):(\d+)$/);
if (match) {
  targetBotId = match[1];
  contextSize = parseInt(match[2]);
}
```

### 2. Task Status Tracking
```javascript
// Track delegation outcomes
delegationHistory = {
  timestamp: Date.now(),
  from: 'mattyatlas',
  to: 'finnshipley',
  task: '...',
  status: 'completed',
  responsePreview: '...'
}
```

### 3. Response Threading
```javascript
// Link responses back to source chat
// "Finn responded to your delegation: ..."
// Include link to Finn's message
```

### 4. Smart Context Selection
```javascript
// Instead of last N messages, use semantic search
// Select most relevant messages for the task
const relevantContext = await selectRelevantMessages(task, sessionHistory);
```

### 5. Delegation Chains
```javascript
// Allow: MattyAtlas → Finn → Priest
// Track delegation depth, prevent loops
// Max depth: 3
```

---

## Comparison to Session Swapping

| Feature | `/team` (Knowledge Passing) | Session Swapping |
|---------|----------------------------|------------------|
| **Complexity** | Low | High |
| **Time to Build** | 1-2 hours | 6-8 hours |
| **Session Tracking** | Bot sessions only | All sessions |
| **Use Case** | Delegate tasks with context | Transfer entire conversation state |
| **Session Files** | Read-only | Read + Write + Move |
| **Dependencies** | Existing session-manager | Need full session tracking system |
| **Risk** | Low (read-only) | Medium (file operations) |

---

## Why This Design Works

### Leverages Existing Infrastructure
- ✅ `sendToClaudeSession()` already handles bot invocation
- ✅ Session manager already tracks bot sessions
- ✅ Telegram routing already works
- ✅ Claude's `--resume` flag handles session continuity

### Minimal New Code
- ~150 lines of new code
- No database changes
- No new dependencies
- No breaking changes

### Scales Well
- Works with any number of bots
- Works with multiple platforms (Telegram, Discord future)
- Session files are independent (no conflicts)
- Parallel delegations possible

### Natural User Experience
- Familiar Telegram mention syntax (@botname)
- Clear delegation format
- Visible confirmations
- Error messages guide correct usage

---

## Success Metrics

**Phase 1 Success:**
- [ ] User can type `/team @finn task` in MattyAtlas chat
- [ ] Finn receives delegation message with context
- [ ] Finn responds in Finn's chat
- [ ] MattyAtlas shows confirmation message
- [ ] Context includes last 5 messages

**Phase 2 Success:**
- [ ] Multi-bot delegation works (`/team @finn @priest`)
- [ ] Error handling covers all edge cases
- [ ] Performance is acceptable (< 2 seconds)
- [ ] No session corruption or race conditions

**Phase 3 Success:**
- [ ] VSCode → Bot delegation works (via MCP tool)
- [ ] Bot → VSCode delegation works (future)
- [ ] Web dashboard shows delegation history

---

## Timeline

**Total Estimated Time:** 1-2 hours

- **Command parsing:** 15 minutes
- **Context retrieval:** 30 minutes
- **Delegation logic:** 30 minutes
- **Error handling:** 15 minutes
- **Testing:** 30 minutes

**Recommended Approach:**
1. Build and test bot-to-bot first (Telegram only)
2. Add multi-bot support
3. Add error handling
4. Later: Add VSCode integration via MCP tool

---

**End of Document**
