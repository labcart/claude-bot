# Claude Bot Platform - Project Outline

## Vision
A multi-bot Telegram platform where each bot has a unique "brain" (personality/system prompt). Built in three product phases: (1) Personal bot management system, (2) Bot-as-a-Service for end users, (3) Platform-as-a-Service for enterprises.

**Phase 1 Focus**: Build a multi-bot management system for running 3-10 bots from one Node.js process on your local machine.

## Three Product Lines (Future Vision)

### Product 1: Personal Bot Platform (Phase 1) ← **WE ARE HERE**
**For**: You (the developer)
- Run unlimited bots from one codebase
- Manage via code (brain files)
- Use your Claude account + MCP tools
- No web UI needed

### Product 2: Bot-as-a-Service (Phase 2+)
**For**: Small businesses, creators, individuals
- Web form to create ONE bot (like Carrd/Linktree)
- You host everything (bots, Claude, MCP)
- Freemium: Free bot + $10/mo for premium
- Multi-tenant SaaS on Cloudflare Workers

### Product 3: Platform-as-a-Service (Phase 3+)
**For**: Enterprises, agencies
- Sell the entire platform as licensed software
- They self-host OR you host for them
- They bring their own Claude accounts + MCP tools
- White-label dashboard
- Revenue: $500-5k license OR $99-299/mo hosting

---

## Phase 1: Personal Bot Platform

### Architecture

```
[Your Mac]
  ├─> Claude Code IDE (running, provides MCP tools)
  │
  ├─> node server.js
  │    ├─> Bot A: "SmarterChild" (brain: smarterchild.js, token: BOT_TOKEN_1)
  │    ├─> Bot B: "TherapistBot" (brain: therapist.js, token: BOT_TOKEN_2)
  │    └─> Bot C: "PoetBot" (brain: poet.js, token: BOT_TOKEN_3)
  │         ↓
  │    Each bot spawns:
  │    claude --ide --resume <session-id> --cwd ~/.claude/projects/bot-<name>/
  │         ↓
  │    Session files: ~/.claude/projects/bot-smarterchild/user-123456789.jsonl
  │
  └─> Supabase (OPTIONAL - only for rate limiting)
       - users (telegram_id, message_count, tier)
```

**Key Design Decisions:**
- ✅ **Multi-bot from day 1** - No single-bot version, build scalable from start
- ✅ **Claude session files** - Use Claude's built-in session management (like telecode)
- ✅ **MCP via --ide** - No tracking/limits in Phase 1 (you're the only user)
- ✅ **Local deployment** - Just `node server.js` on your Mac
- ✅ **Database optional** - Can start without Supabase, add later for rate limits

---

## Project Structure

```
claude-bot/
├── server.js                  # Main entry point - runs all bots
├── .env.example              # Template for environment variables
├── package.json              # Dependencies
│
├── config/
│   └── bots.json             # Bot registry (name, token, brain file)
│
├── brains/                   # Bot personality configs
│   ├── smarterchild.js      # Modern SmarterChild personality
│   ├── therapist.js         # Supportive therapy bot
│   ├── poet.js              # Creative writing bot
│   └── _template.js         # Template for new brains
│
├── lib/                      # Core modules
│   ├── bot-manager.js       # Manages multiple Telegram bot instances
│   ├── brain-loader.js      # Loads brain files, builds prompts
│   ├── session-manager.js   # Claude session file management
│   ├── claude-client.js     # Wrapper for Claude CLI (reuses telecode logic)
│   └── rate-limiter.js      # OPTIONAL: Rate limiting via Supabase
│
├── db/                       # Database (OPTIONAL - Phase 1b)
│   ├── schema.sql           # Supabase schema
│   └── README.md            # Setup instructions
│
├── telecode-EXAMPLE-PROJECT/ # Original proof of concept (reference)
│   └── ...
│
└── docs/                     # Documentation
    ├── BRAIN-FILES.md       # How to create brain files
    └── ADDING-BOTS.md       # How to add a new bot
```

---

## Brain File Format

Brain files are simple JavaScript modules that export personality config.

### Example: `brains/smarterchild.js`

```javascript
module.exports = {
  // Bot identity
  name: "SmarterChild",
  version: "2.0", // Modern reboot

  // Core personality
  systemPrompt: `You are SmarterChild, the legendary AIM bot from 2001, now rebooted for 2025.

PERSONALITY:
- Witty, slightly sarcastic, but helpful
- Quick responses (2-3 sentences max)
- Reference both 2000s nostalgia AND modern internet culture
- Self-aware about being an AI, but playful about it

TONE:
- Casual and conversational
- Use occasional internet slang (lol, ngl, fr)
- Don't be cringe - you're cool, not trying too hard

RULES:
- Keep responses BRIEF (under 100 words)
- If user asks serious questions, give helpful answers but keep the vibe light
- Never break character
- If you don't know something, admit it playfully

EXAMPLES:
User: "What's the weather?"
You: "lol I'm a chatbot not a meteorologist. try google or look outside your window 😏"

User: "Tell me a joke"
You: "why did the AI cross the road? to get to the other dataset 🤖 (sorry that was terrible)"`,

  // Optional: Additional context to inject
  contextPrefix: (user) => {
    // Can add user-specific context here
    return `Chatting with Telegram user ${user.username || user.id}`;
  },

  // Response style hints (for future use)
  maxTokens: 150,      // Keep responses short
  temperature: 0.8,    // Slightly creative

  // Rate limits (OPTIONAL - for Phase 1b with DB)
  rateLimits: {
    free: 20,    // 20 msgs/day for free users
    paid: 1000   // 1000 msgs/day for paid users
  }
};
```

### Brain File Template: `brains/_template.js`

```javascript
module.exports = {
  name: "BotName",
  version: "1.0",

  systemPrompt: `You are [CHARACTER DESCRIPTION].

PERSONALITY:
- [Trait 1]
- [Trait 2]
- [Trait 3]

TONE:
- [How bot speaks]

RULES:
- [Constraint 1]
- [Constraint 2]`,

  contextPrefix: (user) => {
    return `Chatting with ${user.username || 'user'}`;
  },

  maxTokens: 200,
  temperature: 0.7,

  rateLimits: {
    free: 10,
    paid: 1000
  }
};
```

---

## Bot Registry Format

`config/bots.json` - Maps Telegram tokens to brain files.

```json
[
  {
    "id": "smarterchild",
    "name": "SmarterChild",
    "telegramToken": "123456:ABC-DEF...",
    "brainFile": "smarterchild",
    "active": true,
    "projectDir": "bot-smarterchild"
  },
  {
    "id": "therapist",
    "name": "TherapyBot",
    "telegramToken": "789012:GHI-JKL...",
    "brainFile": "therapist",
    "active": true,
    "projectDir": "bot-therapist"
  },
  {
    "id": "poet",
    "name": "PoetBot",
    "telegramToken": "345678:MNO-PQR...",
    "brainFile": "poet",
    "active": false,
    "projectDir": "bot-poet"
  }
]
```

**Alternative**: Store in `.env` for Phase 1 simplicity:
```bash
BOTS='[{"id":"smarterchild","token":"...","brain":"smarterchild"}]'
```

---

## Session Management Strategy

### Phase 1a: Pure Claude Sessions (SIMPLEST - Start Here)

**How it works:**
1. User messages bot on Telegram
2. Bot creates/resumes Claude session file: `~/.claude/projects/bot-smarterchild/user-<telegram-id>.jsonl`
3. Every message from that user goes to same session file
4. Claude maintains full conversation history

**Pros:**
- Zero database needed
- Claude handles all context management
- Telecode already proves this works

**Cons:**
- Session files grow unbounded
- No cross-device context (but Telegram users are tied to phone anyway)
- Can't easily search/analyze conversations

**File naming:**
```
~/.claude/projects/
  ├─ bot-smarterchild/
  │   ├─ user-123456789.jsonl  # User A's conversation
  │   ├─ user-987654321.jsonl  # User B's conversation
  │   └─ ...
  ├─ bot-therapist/
  │   ├─ user-123456789.jsonl  # Same user, different bot, separate session
  │   └─ ...
```

### Phase 1b: Add Supabase for Rate Limiting (OPTIONAL)

**When to add:** When you want to limit free users to X messages/day.

**Database schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  tier TEXT DEFAULT 'free', -- 'free' or 'paid'
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE message_counts (
  user_id UUID REFERENCES users(id),
  bot_id TEXT NOT NULL,
  count INT DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, bot_id, date)
);

CREATE INDEX idx_message_counts_date ON message_counts(date);
```

**Usage:**
- Before sending to Claude, check if user has exceeded daily limit
- Increment count after successful response
- Reset counts daily (cron job or query-time check)

### Phase 1c: Hybrid Approach (LATER - After 1a works)

**When session files get too large:**
1. Every 50 messages, create new Claude session
2. Ask Claude to summarize previous session
3. Inject summary into new session's first message

**Summary example:**
```
System: Previous conversation summary: User's name is Alex, lives in NYC,
interested in AI and fitness. Discussed workout routines and asked about
machine learning basics.
```

**This is future optimization - don't build yet.**

---

## Phase 1 Implementation Tasks

### Stage 1: Project Setup (LLM-Buildable)

**Goal**: Set up project structure and dependencies.

- [ ] **1.1** Create `package.json`
  - Dependencies: `node-telegram-bot-api`, `dotenv`
  - Dev dependencies: `nodemon`
  - Scripts: `"start": "node server.js"`, `"dev": "nodemon server.js"`

- [ ] **1.2** Create `.env.example` template
  ```bash
  # Claude
  CLAUDE_CMD=claude

  # Bots (JSON array)
  BOTS=[{"id":"smarterchild","token":"YOUR_TOKEN_HERE","brain":"smarterchild"}]

  # Optional: Supabase (for rate limiting)
  # SUPABASE_URL=https://xxx.supabase.co
  # SUPABASE_KEY=your-anon-key
  ```

- [ ] **1.3** Create directory structure
  - `mkdir -p brains lib config db docs`

- [ ] **1.4** Copy telecode files to `lib/` as reference
  - Copy `claude-wrapper-v2.js` → `lib/claude-client.js`
  - Keep as-is for now (proven to work)

---

### Stage 2: Brain File System

**Goal**: Create brain file loading system and example brains.

- [ ] **2.1** Create `brains/_template.js` (template for new brains)
  - Include all fields with comments
  - Document each section

- [ ] **2.2** Create `brains/smarterchild.js`
  - Modern SmarterChild personality (witty, brief, nostalgic)
  - System prompt ~300 words
  - Max tokens: 150
  - Temperature: 0.8

- [ ] **2.3** Create `brains/therapist.js` (second example)
  - Supportive, empathetic personality
  - System prompt focused on active listening
  - Max tokens: 250
  - Temperature: 0.6

- [ ] **2.4** Create `lib/brain-loader.js`
  ```javascript
  class BrainLoader {
    constructor() {
      this.cache = new Map(); // Cache loaded brains
    }

    load(brainName) {
      // Load brain file from brains/<name>.js
      // Cache in memory
      // Return brain config object
    }

    buildSystemPrompt(brainName, user) {
      // Get brain
      // Build full system prompt (systemPrompt + contextPrefix)
      // Return string to inject into Claude
    }
  }
  ```

- [ ] **2.5** Create `docs/BRAIN-FILES.md`
  - How to create a new brain
  - Explain each field in brain config
  - Tips for writing good system prompts

---

### Stage 3: Session Management

**Goal**: Manage Claude session files per user+bot.

- [ ] **3.1** Create `lib/session-manager.js`
  ```javascript
  class SessionManager {
    getSessionId(botId, telegramUserId) {
      // Generate session ID: user-<telegram-id>
      // Return session ID for Claude CLI --resume flag
    }

    getProjectPath(botId) {
      // Return ~/.claude/projects/bot-<id>/
      // Ensure directory exists
    }

    getSessionFilePath(botId, telegramUserId) {
      // Return full path to session file
      // For logging/debugging
    }
  }
  ```

- [ ] **3.2** Test session file creation
  - Manually run `claude --ide --resume user-12345` from project dir
  - Verify session file created at correct path
  - Verify conversation persists across restarts

---

### Stage 4: Bot Manager (Multi-Bot Support)

**Goal**: Run multiple Telegram bots from one process.

- [ ] **4.1** Create `lib/bot-manager.js`
  ```javascript
  class BotManager {
    constructor() {
      this.bots = new Map(); // botId → TelegramBot instance
      this.brainLoader = new BrainLoader();
      this.sessionManager = new SessionManager();
      this.claudeClient = new ClaudeClient();
    }

    addBot(config) {
      // config: { id, token, brain }
      // Create Telegram bot instance
      // Set up message handler
      // Store in this.bots Map
    }

    async handleMessage(botId, msg) {
      // 1. Get brain for this bot
      // 2. Get/create Claude session for user
      // 3. Build system prompt (brain + user context)
      // 4. Send to Claude via claudeClient
      // 5. Stream response back to Telegram
    }

    startAll() {
      // Start all bots
      // Log which bots are running
    }
  }
  ```

- [ ] **4.2** Message handling flow
  - Reuse telecode's streaming logic
  - Edit message as Claude streams response
  - Handle chunking for messages >4096 chars
  - Handle errors gracefully (send error message to user)

- [ ] **4.3** System prompt injection
  - Load brain file
  - Build system prompt with `brain.buildSystemPrompt(user)`
  - Inject as first message OR prepend to user's message
  - Research: Best way to inject system prompt into Claude CLI?
    - Option A: Prepend to user message: `"${systemPrompt}\n\nUser: ${message}"`
    - Option B: Use separate system message (if CLI supports)
    - **Decision needed**: Test both approaches

---

### Stage 5: Main Server

**Goal**: Wire everything together in `server.js`.

- [ ] **5.1** Create `server.js`
  ```javascript
  require('dotenv').config();
  const BotManager = require('./lib/bot-manager');

  const manager = new BotManager();

  // Load bot configs from env
  const bots = JSON.parse(process.env.BOTS);

  // Add each bot
  bots.forEach(bot => {
    if (bot.active !== false) { // Default to active
      manager.addBot(bot);
    }
  });

  // Start all bots
  manager.startAll();

  console.log('🤖 Bot platform running...');
  console.log(`📊 Active bots: ${bots.filter(b => b.active !== false).length}`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
  });
  ```

- [ ] **5.2** Add logging
  - Log when bots start
  - Log each message: `[botId] User ${userId}: ${message.substring(0, 50)}...`
  - Log Claude responses
  - Log errors with stack traces

- [ ] **5.3** Error handling
  - Try/catch around Claude calls
  - Send user-friendly error messages
  - Don't crash server on error (keep other bots running)

---

### Stage 6: Testing & Documentation

**Goal**: Verify everything works, document setup.

- [ ] **6.1** Create `docs/ADDING-BOTS.md`
  - How to get Telegram bot token from BotFather
  - How to add bot to `config/bots.json` or `.env`
  - How to create brain file
  - How to test bot

- [ ] **6.2** Create `README.md` (user-facing)
  - What is this project?
  - Quick start guide
  - How to add a bot
  - Troubleshooting

- [ ] **6.3** Manual testing checklist
  - [ ] Start server with 1 bot → works
  - [ ] Send message → get response
  - [ ] Restart server → conversation continues (session persists)
  - [ ] Add 2nd bot → both bots work independently
  - [ ] Test streaming (long Claude response updates in real-time)
  - [ ] Test error handling (invalid message, Claude timeout)

- [ ] **6.4** Edge case testing
  - [ ] User sends message while Claude is processing (queue handling)
  - [ ] Very long user message (>2000 chars)
  - [ ] Very long Claude response (>4096 chars - chunking)
  - [ ] Bot token is invalid (graceful error)
  - [ ] Claude CLI not found (clear error message)

---

### Stage 7: OPTIONAL - Rate Limiting with Supabase

**Goal**: Add daily message limits for free users.

**Only build this if you want to test freemium model in Phase 1.**

- [ ] **7.1** Create `db/schema.sql`
  - `users` table
  - `message_counts` table
  - Indexes

- [ ] **7.2** Create `db/README.md`
  - Supabase account setup steps
  - How to run schema.sql
  - Environment variables needed

- [ ] **7.3** Create `lib/rate-limiter.js`
  ```javascript
  class RateLimiter {
    async checkLimit(userId, botId, brain) {
      // Query message_counts for today
      // Compare against brain.rateLimits
      // Return { allowed: bool, remaining: int }
    }

    async incrementCount(userId, botId) {
      // Increment today's count for this user+bot
    }
  }
  ```

- [ ] **7.4** Integrate into bot-manager.js
  - Before sending to Claude, check limit
  - If exceeded, send paywall message:
    ```
    You've used all 20 free messages today!
    Upgrade to premium for unlimited: [link]
    ```
  - After successful response, increment count

- [ ] **7.5** Add `/stats` command
  - Show user their message count for today
  - "You've used 5/20 free messages today"

---

## Environment Variables (Phase 1)

### Required
```bash
# Claude CLI
CLAUDE_CMD=claude  # Path to claude binary (default: 'claude')

# Bot configurations (JSON array)
BOTS=[
  {
    "id": "smarterchild",
    "token": "123456:ABC-DEF1234...",
    "brain": "smarterchild",
    "active": true
  },
  {
    "id": "therapist",
    "token": "789012:GHI-JKL5678...",
    "brain": "therapist",
    "active": true
  }
]
```

### Optional (for rate limiting)
```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-key
```

---

## Open Questions for Phase 1

### Q1: System Prompt Injection Method
**Question**: How to inject brain's system prompt into Claude?

**Options:**
1. Prepend to user message: `"${systemPrompt}\n\nUser: ${message}"`
2. Send as separate message before user message
3. Use Claude CLI flag (if exists)

**Action**: Test each approach, choose best one.

---

### Q2: Session File Rotation
**Question**: When to rotate to new Claude session?

**Options:**
1. Never (let files grow unbounded)
2. After N messages (e.g., 50)
3. After X days (e.g., 7 days)
4. When file size exceeds Y MB

**Action**: Start with option 1 (simplest), add rotation in Phase 1c if needed.

---

### Q3: Bot Config Storage
**Question**: Store bot configs in `.env` (JSON string) or `config/bots.json` file?

**Options:**
1. `.env` - Single source of truth, easy for 1-3 bots
2. `config/bots.json` - Better for 5+ bots, easier to edit
3. Database - Over-engineered for Phase 1

**Action**: Start with `.env`, migrate to JSON file if >3 bots.

---

### Q4: MCP Tools Availability
**Question**: Do all bots share the same MCP tools, or can we configure per-bot?

**Answer (assumption)**: All bots share MCP tools (whatever's available in your Claude Code IDE). No per-bot configuration needed in Phase 1.

**Action**: Document in `docs/MCP-TOOLS.md` that MCP tools are global (all bots have access).

---

## Success Metrics - Phase 1

### Minimum Viable Product (MVP)
- [ ] 2 bots running simultaneously
- [ ] Each bot has distinct personality (different brain files)
- [ ] Conversations persist (sessions saved in Claude files)
- [ ] No crashes after 100 messages across both bots
- [ ] Response time <5 seconds for simple queries

### Stretch Goals
- [ ] 5+ bots running
- [ ] Rate limiting working (with Supabase)
- [ ] MCP tools working (e.g., image generation via MCP)
- [ ] Session rotation implemented (new session every 50 msgs)

---

## Phase 2+ (Future Vision - Not Building Yet)

### Phase 2: Bot-as-a-Service (SaaS)

**High-level tasks** (not detailed yet):
- Web app (Next.js) for bot creation
- Bot creation form → auto-generates brain file
- Multi-tenant architecture (isolate customer data)
- Stripe integration (freemium → $10/mo)
- Cloudflare Workers deployment
- Claude account load balancing
- MCP usage tracking & limits
- Analytics dashboard (messages, users, revenue)

**Success**: 10 paying customers ($100/mo revenue)

---

### Phase 3: Platform-as-a-Service (Enterprise)

**High-level tasks** (not detailed yet):
- Docker Compose setup
- Self-hosted deployment guide
- White-label dashboard
- MCP plugin system (customers add their own tools)
- License key management
- Enterprise support documentation

**Success**: 1 enterprise customer ($2k+ deal)

---

## Next Steps

1. **Review this outline** - Does Phase 1 scope make sense?
2. **Choose starting point**:
   - **Option A**: Build brain file system first (Stage 2)
   - **Option B**: Build bot manager first (Stage 4)
   - **Option C**: Modify telecode bridge.js to support brain loading (hybrid approach)
3. **Decide open questions**:
   - System prompt injection method?
   - Bot config storage (.env vs JSON file)?
4. **Start building** - I can execute all LLM-buildable tasks from Stage 1-6

**Ready to start? Which stage should we tackle first?**
