# Architecture

## What This Is

A multi-agent orchestration platform using Telegram (currently) as the interface. Multiple specialized Claude bots can delegate tasks to each other, share context, and provide structured responses (YES/NO) for conditional logic.

**Core concept:** Chat interface with specialized bot personalities that can all access the same codebase and conversations, differentiated by role/expertise rather than access control.

Analogies:
- **Slack/Discord for AI agents** - observable conversations
- **Message bus for LLMs** - structured delegation between agents
- **Shared context workspace** - all bots see everything, specialized by personality

## Key Difference from Other Tools

**vs. ChatGPT:** Single agent, no delegation, isolated context per session

**vs. AutoGPT/LangChain:** Black box execution with limited visibility, ephemeral agents

**This system:**
- Multiple persistent bot personalities (Finn: backend, Matty: design, Rick: security)
- Observable conversations (Telegram/future web UI shows everything)
- Structured delegation (pass context between bots)
- Callbacks for conditional logic (ask bot YES/NO, act on response)
- Full context sharing (all bots can access codebase, conversations)
- Human oversight (intervene at any point)

**Interesting property:** Bots are differentiated by personality/expertise, not by access control. They all see everything but respond differently based on their role.

Example: "Finn implement auth, Matty review UX, Rick check security" - they work in parallel, reference the same files, see each other's work, no handoffs needed.

## Key Architectural Components

### 1. Bot Server (`server.js`, `lib/bot-manager.js`)
The orchestration layer that manages:
- Multiple bot instances (each a Claude CLI session)
- Session management (persistent conversations)
- Delegation system (send context between bots)
- Callback system (structured responses)
- HTTP endpoints for external integration

### 2. Specialized Bot Personalities (`brains/*.js`)
Each bot has:
- Unique personality and expertise
- System prompt defining their role
- Access to all tools/codebase (via MCP)
- Persistent session memory

Example:
- **Finn:** Backend engineer, pragmatic, security-focused
- **Matty:** Full-stack, design-conscious, UX-oriented
- **Rick:** DevOps/security specialist

### 3. Delegation & Callback System
**Two-way structured communication between agents:**

#### Simple Delegation (fire-and-forget):
```javascript
// User asks Finn to implement feature
// Finn needs design input
delegateToBot('finnshipley', 'mattyatlas', userId,
  'Review this auth flow for UX issues',
  recentMessages)
// Matty responds on Telegram
// Finn sees response, continues work
```

#### Structured Callbacks (wait for response):
```javascript
// User asks Claude (in IDE) to validate approach
// Claude asks Finn for opinion
delegate_to_bot({
  targetBot: 'finnshipley',
  task: 'Is this architecture secure?',
  waitForResponse: true
})
// Finn responds with YES/NO + reasoning
// Claude receives structured response
// Claude makes decision based on Finn's input
```

### 4. Consensus Mechanism
**Multi-bot voting for critical decisions:**

```javascript
// Ask multiple bots the same question
const finnResponse = await delegate_to_bot('finnshipley', task, true)
const mattyResponse = await delegate_to_bot('mattyatlas', task, true)
const rickResponse = await delegate_to_bot('rickd', task, true)

// Conditional logic based on consensus
if (finnResponse.YES && mattyResponse.YES && rickResponse.YES) {
  // All approve → proceed
} else if (allNO) {
  // All reject → abort
} else {
  // Split decision → investigate or escalate to human
}
```

### 5. Observable Interface (Current: Telegram, Future: Web UI)

**Telegram serves as:**
- The primary interface (you chat with bots)
- The visibility layer (see all bot responses)
- The control panel (issue commands, delegate tasks)
- The audit log (all conversations persisted)

**Why Telegram works:**
- ✅ Real-time messaging (natural conversation flow)
- ✅ Mobile + desktop (work anywhere)
- ✅ Rich formatting (markdown, code blocks)
- ✅ Already built (no custom UI needed)

**Future: Web UI**
- Replace Telegram with React app
- Discord/Slack-like interface
- Sidebar with bot roster
- File explorer integrated
- One-click delegation buttons
- **Core architecture stays the same** - just swap the interface layer

## System Flow Examples

### Example 1: Feature Implementation with Review
```
You → Claude (IDE): "Implement user authentication"

Claude → Finn (delegation):
  "Implement backend auth with JWT"

Finn → works on implementation →
  sends code back to Claude

Claude → Matty (callback):
  "Does this login flow make sense for users? YES/NO"

Matty → responds:
  "YES - Clean, standard OAuth flow"

Claude → Rick (callback):
  "Is this auth implementation secure? YES/NO"

Rick → responds:
  "NO - Missing rate limiting on login endpoint"

Claude → Finn (delegation):
  "Rick flagged missing rate limiting, please add"

Finn → implements fix →
  sends updated code

Claude → Rick (callback):
  "Is it secure now? YES/NO"

Rick → responds:
  "YES - Looks good"

Claude → You:
  "Auth implemented, reviewed by Matty,
   secured by Rick. Ready to deploy."
```

### Example 2: Multi-Bot Consensus
```
You → Claude: "Should we migrate to microservices?"

Claude → Finn, Matty, Rick (parallel):
  "Should we migrate to microservices? YES/NO"

Finn → "NO - premature, adds complexity"
Matty → "NO - current monolith is manageable"
Rick → "YES - better for scaling/security isolation"

Claude → You:
  "2 out of 3 say NO. Consensus is to stay monolith.
   Reasoning: [shows all responses]"
```

### Example 3: Automated Code Review Gate
```
Finn → finishes feature implementation

Bot Server → automatically delegates to Rick:
  "Review Finn's auth PR. Approve? YES/NO"

Rick → reviews code:
  "YES - security looks good, rate limiting in place"

Bot Server → automatically deploys (because Rick approved)

Bot Server → Telegram notification:
  "✅ Auth feature deployed (approved by Rick)"
```

## Benefits of This Approach

**Transparency:** All conversations visible on Telegram (or future web UI), human can intervene anytime

**Specialization without silos:** Bots have different expertise but same access to codebase/context

**Scalability:** Adding new bots = new capabilities; bots are stateless (session = state)

**Incremental complexity:** Start simple (2 bots, YES/NO), add complexity later (loops, workflows)

**Multi-agent safety:** Security bot can review/veto decisions from other bots

## Technical Stack

### Backend:
- **Node.js** - Bot server, session management
- **Claude CLI** - Each bot is a Claude session
- **Telegram Bot API** - Current interface
- **MCP (Model Context Protocol)** - Tool/codebase access
- **Express** - HTTP endpoints for delegation

### Bot Brains:
- **JavaScript configs** (`brains/*.js`) - Personality definitions
- **System prompts** - Define expertise/behavior
- **MCP tools** - File access, code execution, external APIs

### Future UI:
- **React/Next.js** - Web interface
- **WebSocket** - Real-time chat
- **TailwindCSS** - Styling

## Current State (Phase 2 Complete)

✅ **Phase 1:** Bot-to-bot delegation
  - Telegram `/team` command
  - Context sharing between bots
  - Visible on Telegram

✅ **Phase 2:** Structured callbacks (JUST COMPLETED)
  - IDE → bot delegation via MCP tool
  - Wait for YES/NO responses
  - Conditional logic based on responses
  - Consensus mechanism working

🔜 **Phase 3:** Web UI
  - Replace Telegram with React app
  - Discord/Slack-like interface
  - Drag-and-drop delegation
  - Visual workflow builder

🔜 **Phase 4:** Advanced Orchestration
  - Looping (retry on failure)
  - Parallel execution with join
  - State machines for complex workflows
  - Approval gates with escalation

🔜 **Phase 5:** Ecosystem
  - Plugin system for custom bots
  - Marketplace for bot personalities
  - Integration with external tools (GitHub, Jira, etc.)
  - API for third-party orchestration

## Comparison to Existing Systems

| Feature | This System | ChatGPT | AutoGPT | LangChain |
|---------|-------------|---------|---------|-----------|
| Multiple specialized agents | ✅ Yes | ❌ Single | ✅ Yes (ephemeral) | ✅ Yes |
| Observable conversations | ✅ Yes (Telegram) | ✅ Yes | ❌ No | ❌ No |
| Persistent personalities | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Human in the loop | ✅ Yes (anytime) | ✅ Yes | ⚠️ Limited | ❌ No |
| Structured callbacks | ✅ Yes | ❌ No | ❌ No | ⚠️ Partial |
| Full context sharing | ✅ Yes (all bots) | ❌ Single session | ❌ No | ❌ No |
| Consensus mechanism | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Non-technical friendly | ✅ Yes (chat UI) | ✅ Yes | ❌ No | ❌ No (code) |

## Current Status

Phase 2 complete. Working features:
- Bot-to-bot delegation via `/team` command
- IDE → bot delegation via MCP tool
- Structured callbacks (YES/NO responses)
- Multi-bot consensus
- Natural language parsing
- Telegram visibility

See [DELEGATION-SYSTEM.md](./DELEGATION-SYSTEM.md) for implementation details.

See [NOTES.md](./NOTES.md) for general ideas and future exploration.
