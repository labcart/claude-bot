# Session Swapping Feature - Advanced Session Portability

**Created:** November 2, 2025
**Status:** Planning Phase (Future Feature)
**Estimated Implementation Time:** 6-8 hours
**Complexity:** High (requires extensive session tracking)

---

## Overview

Session Swapping is an **advanced feature** that allows moving entire Claude conversation states between different bots or contexts. Unlike `/team` (which passes knowledge), this feature actually **transfers session ownership** and allows bots to resume conversations with full historical context.

---

## Core Concept

**What it does:**
- Take a Claude session from anywhere (VSCode, Telegram bot, CLI)
- Attach it to a different bot or context
- The new bot can resume with ALL historical context
- Session files are copied/moved between directories
- Session tracking is updated to reflect new ownership

**Difference from `/team`:**

| Feature | `/team` (Knowledge Passing) | Session Swapping |
|---------|----------------------------|------------------|
| What's transferred | Last N messages (context) | Entire session file |
| Source session | Stays intact | Can be moved/copied |
| Target session | Receives new message | Becomes the session |
| Reversible | N/A | Can swap back |
| Complexity | Low | High |
| Use case | "Tell Finn about this" | "Let Finn take over this conversation" |

---

## Architecture Requirements

### Current State (What We Have)

```javascript
// Bot sessions tracked in session-manager.js
sessionMap = {
  'finnshipley-123456': 'abc-def-uuid',
  'mattyatlas-123456': 'xyz-abc-uuid'
}

// Session files stored per project
~/.claude/projects/-opt-lab-claude-bot/
  ├── abc-def-uuid.jsonl  // Finn's session
  └── xyz-abc-uuid.jsonl  // MattyAtlas's session
```

**Limitation**: We only track bot sessions (Telegram), not regular Claude sessions.

---

### What We Need to Build

#### 1. **Universal Session Tracker**

Track ALL Claude sessions, not just bot sessions:

```javascript
// New: comprehensive-session-manager.js
allSessions = {
  // Bot sessions (existing)
  'bot:finnshipley:123456': {
    sessionId: 'abc-def-uuid',
    type: 'telegram-bot',
    botId: 'finnshipley',
    userId: '123456',
    projectPath: '/opt/lab/claude-bot',
    lastActive: 1698765432000
  },

  // VSCode sessions (new)
  'vscode:bryan:portability-session': {
    sessionId: 'xyz-123-uuid',
    type: 'vscode',
    nickname: 'portability-discussion',
    userId: 'bryan',
    projectPath: '/opt/lab/claude-bot',
    lastActive: 1698765555000
  },

  // CLI sessions (new)
  'cli:bryan:auth-design': {
    sessionId: 'def-456-uuid',
    type: 'cli',
    nickname: 'auth-design',
    userId: 'bryan',
    projectPath: '/opt/lab/api-server',
    lastActive: 1698765123000
  }
}
```

**How to populate:**
- **Bot sessions**: Already tracked via session-manager
- **VSCode/CLI sessions**: Integrate with chat-context MCP
- **Discovery**: Scan `~/.claude/projects/` directories on startup

---

#### 2. **Chat-Context MCP Integration**

Your chat-context MCP already has this data! We just need to integrate it.

```javascript
// Chat-context MCP tracks ALL sessions
const allSessions = await fetch('http://localhost:3003/list_sessions', {
  method: 'POST',
  body: JSON.stringify({
    limit: 1000,
    project: 'all',
    source: 'all'  // Both Cursor and Claude Code sessions
  })
});

// Import into comprehensive-session-manager
for (const session of allSessions) {
  comprehensiveSessionManager.register({
    sessionId: session.id,
    type: session.source,  // 'cursor' or 'claude'
    nickname: session.nickname,
    projectPath: session.project,
    lastActive: session.timestamp
  });
}
```

**Key Insight**: Chat-context MCP is a **read-only view** of sessions. Session swapping needs **write access**.

---

#### 3. **Session File Operations**

```javascript
class SessionSwapper {
  /**
   * Copy session file to new location
   */
  async copySession(sessionId, targetProject, targetBot = null) {
    const sourcePath = this.getSessionPath(sessionId);
    const targetPath = this.buildTargetPath(targetProject, targetBot, sessionId);

    // Copy file
    await fs.promises.copyFile(sourcePath, targetPath);

    // Update tracking
    if (targetBot) {
      sessionManager.setSession(targetBot, userId, sessionId);
    }
  }

  /**
   * Move session file (destructive)
   */
  async moveSession(sessionId, targetProject, targetBot = null) {
    await this.copySession(sessionId, targetProject, targetBot);

    // Remove source
    const sourcePath = this.getSessionPath(sessionId);
    await fs.promises.unlink(sourcePath);
  }

  /**
   * Attach existing session to bot
   */
  async attachToBot(sessionId, botId, userId) {
    const sessionPath = this.getSessionPath(sessionId);
    const botProjectPath = this.getBotProjectPath();
    const targetPath = path.join(botProjectPath, `${sessionId}.jsonl`);

    // If not in bot directory, copy it there
    if (sessionPath !== targetPath) {
      await fs.promises.copyFile(sessionPath, targetPath);
    }

    // Update session manager
    sessionManager.setSession(botId, userId, sessionId);
  }

  /**
   * Fork session (create copy for experimentation)
   */
  async forkSession(sourceSessionId, nickname) {
    const newSessionId = generateUuid();
    const sourcePath = this.getSessionPath(sourceSessionId);
    const targetPath = this.getSessionPath(newSessionId);

    await fs.promises.copyFile(sourcePath, targetPath);

    // Add metadata
    await this.tagSession(newSessionId, nickname);

    return newSessionId;
  }
}
```

---

#### 4. **User Identity Mapping**

To swap sessions across platforms, need unified user identity:

```javascript
// Currently: Platform-specific IDs
Telegram user: 123456
VSCode user: "bryan"
CLI user: "bryan"

// Need: Master user ID
const userIdentityMap = {
  'telegram:123456': 'user:bryan',
  'vscode:bryan': 'user:bryan',
  'cli:bryan': 'user:bryan'
};

// When swapping sessions:
function resolveUserId(platform, platformUserId) {
  const key = `${platform}:${platformUserId}`;
  return userIdentityMap[key] || platformUserId;
}
```

**Implementation**: See [CROSS-BOT-DELEGATION-PLAN.md](./CROSS-BOT-DELEGATION-PLAN.md) Phase 2.

---

## Use Cases

### Use Case 1: VSCode Session → Bot

**Scenario:** You're designing a feature in VSCode, want Finn to implement it

```javascript
// In VSCode session (this one we're in now)
User: "Attach this session to Finn so he can implement the /team feature"

// What happens:
1. Get current VSCode session ID: xyz-123-uuid
2. Copy session file to bot directory:
   ~/.claude/projects/-opt-lab-claude-bot/xyz-123-uuid.jsonl
3. Update session-manager:
   sessionManager.setSession('finnshipley', YOUR_USER_ID, 'xyz-123-uuid')
4. Finn can now --resume xyz-123-uuid
5. Finn has ALL context from this conversation

// Next time you message Finn on Telegram:
Finn: "I see we discussed the /team feature. Let me implement it..."
```

---

### Use Case 2: Bot → Bot Session Transfer

**Scenario:** MattyAtlas can't handle a task, transfers to Finn

```javascript
User in MattyAtlas chat: "This is too complex for you, hand it to Finn"

// What happens:
1. Get MattyAtlas's current session: abc-def-uuid
2. Fork session (keep original): abc-def-uuid-fork
3. Attach fork to Finn:
   sessionManager.setSession('finnshipley', userId, 'abc-def-uuid-fork')
4. Finn now has full MattyAtlas conversation history

// Result:
// - MattyAtlas keeps original session (can continue separately)
// - Finn has forked copy (can diverge from MattyAtlas)
```

---

### Use Case 3: Session Forking for A/B Testing

**Scenario:** Test two different approaches

```javascript
// Current session has 20 messages about auth design
const currentSession = 'auth-design-uuid';

// Fork into two separate sessions
const sessionA = await sessionSwapper.forkSession(
  currentSession,
  'auth-oauth-approach'
);
const sessionB = await sessionSwapper.forkSession(
  currentSession,
  'auth-jwt-approach'
);

// Attach to different bots
await sessionSwapper.attachToBot(sessionA, 'finnshipley', userId);
await sessionSwapper.attachToBot(sessionB, 'mattyatlas', userId);

// Send different prompts
sendToBotSession('finnshipley', userId, "Implement using OAuth 2.0");
sendToBotSession('mattyatlas', userId, "Implement using JWT tokens");

// Compare results
// Both have same starting context, different implementations
```

---

### Use Case 4: Session Merge (Advanced)

**Scenario:** Multiple bots worked on same problem, combine insights

```javascript
// Three sessions with different perspectives:
const sessionA = 'finn-implementation-uuid';  // Technical
const sessionB = 'priest-ethics-uuid';        // Ethical
const sessionC = 'matty-architecture-uuid';   // Architecture

// Merge into single session
const mergedSession = await sessionSwapper.mergeSessions({
  sessions: [sessionA, sessionB, sessionC],
  strategy: 'interleave',  // or 'summary', 'chronological'
  nickname: 'combined-auth-discussion'
});

// Result: Single session with all perspectives
// Can be attached to any bot or used in VSCode
```

---

## Technical Implementation

### Phase 1: Session Discovery & Tracking

**Goal:** Know about ALL Claude sessions, not just bot sessions

```javascript
// 1. Scan ~/.claude/projects/ directories
async function discoverAllSessions() {
  const projectDirs = await fs.promises.readdir(
    path.join(process.env.HOME, '.claude/projects')
  );

  const sessions = [];

  for (const projectDir of projectDirs) {
    const projectPath = path.join(
      process.env.HOME,
      '.claude/projects',
      projectDir
    );

    const files = await fs.promises.readdir(projectPath);
    const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

    for (const file of sessionFiles) {
      const sessionId = path.basename(file, '.jsonl');
      const stats = await fs.promises.stat(path.join(projectPath, file));

      sessions.push({
        sessionId,
        projectDir,
        projectPath,
        lastModified: stats.mtime,
        size: stats.size
      });
    }
  }

  return sessions;
}

// 2. Integrate with chat-context MCP for metadata
async function enrichWithMetadata(sessions) {
  for (const session of sessions) {
    const metadata = await fetch('http://localhost:3003/get_session', {
      method: 'POST',
      body: JSON.stringify({
        idOrNickname: session.sessionId,
        maxMessages: 1  // Just need metadata
      })
    });

    if (metadata.nickname) {
      session.nickname = metadata.nickname;
    }
    if (metadata.tags) {
      session.tags = metadata.tags;
    }
  }
}
```

---

### Phase 2: Session File Operations

```javascript
class SessionFileManager {
  constructor() {
    this.sessionCache = new Map();
  }

  /**
   * Get session file path
   */
  getSessionPath(sessionId, projectName = null) {
    if (!projectName) {
      // Search all projects
      projectName = this.findSessionProject(sessionId);
    }

    return path.join(
      process.env.HOME,
      '.claude/projects',
      projectName,
      `${sessionId}.jsonl`
    );
  }

  /**
   * Find which project a session belongs to
   */
  findSessionProject(sessionId) {
    // Check cache first
    if (this.sessionCache.has(sessionId)) {
      return this.sessionCache.get(sessionId);
    }

    // Scan directories
    const projectDirs = fs.readdirSync(
      path.join(process.env.HOME, '.claude/projects')
    );

    for (const dir of projectDirs) {
      const sessionPath = path.join(
        process.env.HOME,
        '.claude/projects',
        dir,
        `${sessionId}.jsonl`
      );

      if (fs.existsSync(sessionPath)) {
        this.sessionCache.set(sessionId, dir);
        return dir;
      }
    }

    throw new Error(`Session not found: ${sessionId}`);
  }

  /**
   * Copy session to bot directory
   */
  async copyToBotDirectory(sessionId) {
    const sourcePath = this.getSessionPath(sessionId);
    const targetPath = path.join(
      process.env.HOME,
      '.claude/projects/-opt-lab-claude-bot',
      `${sessionId}.jsonl`
    );

    // Don't copy if already in bot directory
    if (sourcePath === targetPath) {
      return targetPath;
    }

    await fs.promises.copyFile(sourcePath, targetPath);
    return targetPath;
  }

  /**
   * Read session metadata (first and last messages)
   */
  async readSessionMetadata(sessionId) {
    const sessionPath = this.getSessionPath(sessionId);
    const content = await fs.promises.readFile(sessionPath, 'utf8');
    const lines = content.trim().split('\n');

    if (lines.length === 0) {
      return { empty: true };
    }

    const firstMsg = JSON.parse(lines[0]);
    const lastMsg = JSON.parse(lines[lines.length - 1]);

    return {
      empty: false,
      messageCount: lines.length,
      firstMessage: firstMsg.message?.content,
      lastMessage: lastMsg.message?.content,
      firstTimestamp: firstMsg.timestamp,
      lastTimestamp: lastMsg.timestamp
    };
  }
}
```

---

### Phase 3: CLI Tool

```bash
# List all sessions (not just bot sessions)
claude-session list --all

# Search sessions
claude-session search "authentication"

# View session details
claude-session info abc-123-uuid

# Attach session to bot
claude-session attach abc-123-uuid --bot finnshipley --user 123456

# Fork session
claude-session fork abc-123-uuid --name "auth-oauth-fork"

# Swap sessions between bots
claude-session swap \
  --from mattyatlas:123456 \
  --to finnshipley:123456

# Merge sessions
claude-session merge \
  session-a session-b session-c \
  --output merged-session \
  --strategy interleave
```

---

### Phase 4: API Endpoints for VSCode Extension

```javascript
// Add to bot server (server.js or new session-api.js)

app.post('/api/session/attach', async (req, res) => {
  const { sessionId, botId, userId } = req.body;

  try {
    await sessionSwapper.attachToBot(sessionId, botId, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/session/fork', async (req, res) => {
  const { sessionId, nickname } = req.body;

  try {
    const newSessionId = await sessionSwapper.forkSession(sessionId, nickname);
    res.json({ success: true, sessionId: newSessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  const sessions = await comprehensiveSessionManager.getAllSessions();
  res.json(sessions);
});
```

---

## Challenges & Solutions

### Challenge 1: Race Conditions

**Problem:** Bot tries to resume session while it's being copied

**Solution:**
```javascript
// File locking
const lockfile = require('proper-lockfile');

async function copySessionSafely(source, target) {
  const release = await lockfile.lock(source);

  try {
    await fs.promises.copyFile(source, target);
  } finally {
    await release();
  }
}
```

---

### Challenge 2: Session File Format Changes

**Problem:** Claude updates session file format

**Solution:**
```javascript
// Version detection
function detectSessionVersion(sessionPath) {
  const firstLine = fs.readFileSync(sessionPath, 'utf8').split('\n')[0];
  const entry = JSON.parse(firstLine);

  // Check for version markers
  if (entry.version) {
    return entry.version;
  }

  // Fallback: detect by structure
  if (entry.message?.role) {
    return 'v2';  // Current format
  }

  return 'v1';  // Legacy
}

// Conversion if needed
async function convertSessionFormat(sessionPath, targetVersion) {
  // Read, convert, write
}
```

---

### Challenge 3: Context Window Limits

**Problem:** Swapped session has 500+ messages, exceeds context limit

**Solution:**
```javascript
// Truncate or summarize on swap
async function attachToBotWithTruncation(sessionId, botId, userId, maxMessages = 100) {
  const sessionPath = getSessionPath(sessionId);
  const content = fs.readFileSync(sessionPath, 'utf8');
  const lines = content.split('\n');

  if (lines.length > maxMessages) {
    // Option A: Truncate (keep last N)
    const truncated = lines.slice(-maxMessages).join('\n');

    // Option B: Summarize old messages (via Claude)
    const summary = await summarizeMessages(lines.slice(0, -maxMessages));
    const truncated = [summary, ...lines.slice(-maxMessages)].join('\n');
  }

  // Write truncated version
  const newSessionId = generateUuid();
  fs.writeFileSync(
    getBotSessionPath(newSessionId),
    truncated
  );

  sessionManager.setSession(botId, userId, newSessionId);
}
```

---

### Challenge 4: Cross-User Session Sharing

**Problem:** User A wants to share session with User B

**Security considerations:**
- Sessions may contain private information
- Need explicit consent mechanism
- Audit trail for session transfers

**Solution:**
```javascript
// Require explicit approval
async function shareSession(sessionId, fromUserId, toUserId) {
  // Create share token
  const shareToken = generateShareToken();

  await db.insertShareRequest({
    token: shareToken,
    sessionId,
    fromUserId,
    toUserId,
    expiresAt: Date.now() + 3600000  // 1 hour
  });

  // Notify recipient
  await notifyUser(toUserId, `User ${fromUserId} wants to share a session. Accept? Token: ${shareToken}`);

  return shareToken;
}

async function acceptSessionShare(shareToken, toUserId) {
  const request = await db.getShareRequest(shareToken);

  if (!request || request.toUserId !== toUserId) {
    throw new Error('Invalid share token');
  }

  if (Date.now() > request.expiresAt) {
    throw new Error('Share token expired');
  }

  // Copy session for new user
  await copySession(request.sessionId, toUserId);

  await db.markShareComplete(shareToken);
}
```

---

## Data Flow Example

### Scenario: Attach Current VSCode Session to Finn

```
┌─────────────────────────────┐
│  User in VSCode             │
│  Session: xyz-123-uuid      │
│  "Attach this to Finn"      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  VSCode Extension           │
│  - Gets current session ID  │
│  - Calls API endpoint       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Bot Server API             │
│  POST /api/session/attach   │
│  { sessionId, botId, userId }│
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  SessionSwapper             │
│  1. Find session file       │
│  2. Copy to bot directory   │
│  3. Update session-manager  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  File System                │
│  cp ~/.claude/projects/     │
│     -opt-lab/xyz.jsonl      │
│     -opt-lab-claude-bot/    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Session Manager            │
│  setSession(                │
│    'finnshipley',           │
│    userId,                  │
│    'xyz-123-uuid'           │
│  )                          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Next Message to Finn       │
│  Finn resumes xyz-123-uuid  │
│  Has ALL context from VSCode│
└─────────────────────────────┘
```

---

## Comparison: Session Swapping vs `/team`

### When to Use Session Swapping

✅ **Use session swapping when:**
- You want bot to take over ENTIRE conversation
- Context is very long (100+ messages)
- You're "handing off" work permanently
- You want to experiment (fork and test)
- You need to merge perspectives from multiple sessions

### When to Use `/team`

✅ **Use `/team` when:**
- You just need to share recent context
- You want both bots to continue independently
- Quick one-off delegation
- Don't need full history transfer
- Lower complexity is preferred

---

## Dependencies

### New Dependencies Required

```json
{
  "dependencies": {
    "proper-lockfile": "^4.1.2",  // File locking
    "uuid": "^9.0.0"               // Session ID generation (may already have)
  }
}
```

### Integration Points

- **Chat-Context MCP** (port 3003): Session metadata discovery
- **Bot Manager**: Session tracking updates
- **Session Manager**: New methods for universal tracking
- **VSCode Extension** (future): Trigger session operations

---

## File Changes

### New Files

```
lib/
  ├── comprehensive-session-manager.js  // Tracks ALL sessions
  ├── session-swapper.js                // File operations
  ├── session-file-manager.js           // Path resolution, I/O
  └── user-identity-manager.js          // Cross-platform user mapping

cli/
  └── claude-session.js                 // CLI tool

api/
  └── session-api.js                    // HTTP endpoints for VSCode
```

### Modified Files

```
lib/session-manager.js
  - Integrate with comprehensive-session-manager
  - Add setSession() method

lib/bot-manager.js
  - Use comprehensive-session-manager for lookups
  - Support session attachment

server.js
  - Add session API routes
```

---

## Testing Strategy

### Unit Tests

```javascript
describe('SessionSwapper', () => {
  it('should copy session file to bot directory', async () => {
    const result = await sessionSwapper.copyToBotDirectory('test-uuid');
    expect(fs.existsSync(result)).toBe(true);
  });

  it('should attach session to bot', async () => {
    await sessionSwapper.attachToBot('test-uuid', 'finnshipley', '123456');
    const sessionId = sessionManager.getCurrentUuid('finnshipley', '123456');
    expect(sessionId).toBe('test-uuid');
  });

  it('should fork session with new UUID', async () => {
    const newSessionId = await sessionSwapper.forkSession('source-uuid', 'fork-name');
    expect(newSessionId).not.toBe('source-uuid');
    expect(fs.existsSync(getSessionPath(newSessionId))).toBe(true);
  });
});
```

### Integration Tests

```javascript
describe('Session Swapping E2E', () => {
  it('should swap session from VSCode to Finn', async () => {
    // 1. Create mock VSCode session
    const vscodeSessionId = await createMockSession('vscode-test');

    // 2. Attach to Finn
    await sessionSwapper.attachToBot(vscodeSessionId, 'finnshipley', 'test-user');

    // 3. Send message to Finn
    const response = await sendToBotSession('finnshipley', 'test-user', 'Continue from where we left off');

    // 4. Verify Finn has context
    expect(response).toContain('based on our previous discussion');
  });
});
```

---

## Security & Privacy

### Session Ownership

- **Current**: Sessions belong to single user
- **Swapping**: Need to verify user has permission
- **Audit**: Log all session transfers

```javascript
const sessionTransferLog = {
  timestamp: Date.now(),
  sessionId: 'xyz-123',
  fromContext: 'vscode:bryan',
  toContext: 'bot:finnshipley:123456',
  initiatedBy: 'bryan',
  reason: 'manual-attachment'
};
```

### Data Isolation

- Bot sessions in separate directory
- VSCode sessions stay in their project
- Copies don't modify originals (unless move)

---

## Timeline

**Total Estimated Time:** 6-8 hours

### Phase 1: Session Discovery (2 hours)
- Scan all Claude projects
- Integrate with chat-context MCP
- Build comprehensive session index

### Phase 2: File Operations (2 hours)
- Session copy/move functions
- File locking
- Path resolution

### Phase 3: Bot Integration (2 hours)
- Update session-manager
- Add attachment methods
- Test with Telegram bots

### Phase 4: CLI Tool (2 hours)
- Build CLI commands
- Test workflows
- Documentation

### Phase 5: VSCode Extension (Future)
- Build extension UI
- Add keybindings
- Publish to marketplace

---

## Success Metrics

**Phase 1 Success:**
- [ ] Can discover all Claude sessions (bot + non-bot)
- [ ] Can read session metadata
- [ ] Session tracking includes all contexts

**Phase 2 Success:**
- [ ] Can copy session file safely
- [ ] Can attach VSCode session to bot
- [ ] Bot can resume with full context

**Phase 3 Success:**
- [ ] CLI tool works for all operations
- [ ] No session corruption or data loss
- [ ] Performance acceptable (< 1 second for operations)

**Phase 4 Success:**
- [ ] VSCode extension installed
- [ ] Can attach current session to bot via UI
- [ ] Can fork sessions for experimentation

---

## Why This is Hard (vs `/team`)

| Aspect | `/team` | Session Swapping |
|--------|---------|------------------|
| **File I/O** | Read-only | Read + Write + Copy |
| **Session Tracking** | Bot sessions only | ALL sessions |
| **Integration** | Existing session-manager | New comprehensive tracking |
| **User Mapping** | Telegram IDs | Cross-platform identity |
| **Concurrency** | No conflicts | File locking required |
| **Data Model** | Simple message passing | Session ownership transfer |
| **Reversibility** | N/A | Need undo mechanism |
| **Testing** | Simple | Complex (file operations) |

---

## Future Enhancements

### 1. Session Templates
```javascript
// Pre-configured sessions for common tasks
const templates = {
  'code-review': {
    initialMessages: [...],
    tools: ['grep', 'read_file'],
    personality: 'critical'
  }
};

const newSession = await sessionSwapper.createFromTemplate('code-review');
```

### 2. Session Version Control
```javascript
// Git-like versioning for sessions
await sessionSwapper.commit(sessionId, 'Implemented auth system');
await sessionSwapper.checkout(sessionId, 'commit-hash-abc');
await sessionSwapper.diff(sessionA, sessionB);
```

### 3. Session Sharing Marketplace
```javascript
// Public session templates
await sessionSwapper.publish(sessionId, {
  name: 'OAuth Implementation Guide',
  description: 'Step-by-step OAuth setup',
  tags: ['auth', 'tutorial']
});

const template = await sessionSwapper.download('oauth-implementation-guide');
```

---

**End of Document**
