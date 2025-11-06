# Cross-Bot Delegation & Multi-Platform Architecture

**Created:** October 30, 2025 - Initial Planning Session
**Last Updated:** October 30, 2025

---

## Overview

This document outlines the architecture for enabling **cross-bot delegation** and **multi-platform support** in the Claude Bot Platform. The system allows bots to delegate tasks to each other programmatically while maintaining backward compatibility with existing single-bot, single-platform functionality.

---

## Core Concept

**Current State:**
- Each bot operates independently
- Sessions are isolated per `(botId, telegramUserId)` pair
- Users interact with bots 1-on-1 via Telegram

**Target State:**
- Bots can delegate tasks to other bots programmatically
- Users can have unified identity across platforms (Telegram, Discord, Web)
- Support for both 1-on-1 and group chat contexts
- Zero breaking changes to existing public bot functionality

---

## Architecture Components

### 1. User Identity Management (NEW)

**Purpose:** Map platform-specific user IDs to internal master user IDs for cross-platform continuity.

**Schema:**
```javascript
// Platform ID format
platformId = "telegram-<telegramUserId>"
          OR "discord-<discordUserId>"
          OR "web-<sessionToken>"

// Internal master user ID
internalUserId = "user-<MASTER_ID>"  // e.g., "user-bryan-123"

// Session key (unchanged internally)
sessionKey = (botId, internalUserId)
```

**Implementation:**
- New `UserIdentityManager` class
- Mapping table: `platformId → internalUserId`
- Falls back to raw platform IDs for public bots (backward compatible)

**Key Method:**
```javascript
resolveUserId(platform, platformUserId) {
  // Private users: return master ID
  if (this.isPrivateUser(platform, platformUserId)) {
    return this.lookupMasterUserId(platform, platformUserId);
  }
  // Public bots: return platform ID as-is (existing behavior)
  return platformUserId;
}
```

---

### 2. Cross-Bot Delegation (NEW)

**Purpose:** Allow one bot to programmatically invoke another bot's session with context.

**Flow:**
1. User tells MattyAtlas: "tell Finn Shipley to build feature X"
2. MattyAtlas detects trigger pattern (e.g., "tell [botName] to...")
3. MattyAtlas looks up target bot's session: `sessionManager.getCurrentUuid('finnshipley', userId)`
4. MattyAtlas invokes Finn's session via `sendToClaudeSession()` with:
   - Task description
   - Context wrapper explaining this is a delegation from MattyAtlas
   - Last N messages for context (optional)
5. Finn's response appears in Finn's Telegram chat with user (session is bound to that chat)

**Context Wrapper Format:**
```
DELEGATED TASK FROM MATTYATLAS
User: [user name]
Task: [task description]

Recent context from MattyAtlas conversation:
- [message 1]
- [message 2]
- [message 3]

Please complete this task and respond directly.
```

**Implementation:**
- Add trigger detection in bot brain files or `BotManager.handleMessage()`
- Add `DelegationManager` class to handle cross-bot messaging
- Leverage existing `sendToClaudeSession()` - no changes needed

---

### 3. Chat Context Management (NEW)

**Purpose:** Support both private chats (existing) and group chats (new) with appropriate response behavior.

**Chat Types:**

#### Private Chat (1-on-1)
- **Current behavior:** Respond to every message
- **Session scope:** `(botId, userId)` - individual memory
- **No changes needed**

#### Group Chat (Multi-user)
- **New behavior:** Only respond when mentioned/invoked
- **Session scope:** `(botId, chatRoomId)` - shared group memory
  - Alternative: `(botId, userId)` - bot remembers each user individually even in groups
- **Invocation methods:**
  - Mention: `@finnshipley build feature X`
  - Command: `/finn build feature X`
  - Direct delegation from another bot in same group

**Context Resolution:**
```javascript
getChatContext(msg) {
  if (msg.chat.type === 'private') {
    return {
      type: 'private',
      sessionScope: userId,
      respondToAll: true,
      requireMention: false
    };
  } else {
    return {
      type: 'group',
      sessionScope: msg.chat.id,  // OR userId for individual memory
      respondToAll: false,
      requireMention: true
    };
  }
}
```

---

## Implementation Plan

### Phase 1: Cross-Bot Delegation (Single Platform)
**Estimated Time:** 2-3 hours

1. **Add trigger detection in MattyAtlas brain**
   - Pattern: "tell [botName] to [task]"
   - Extract: target bot ID, task description

2. **Create `DelegationManager` class**
   - Method: `delegateTask(sourceBotId, targetBotId, userId, task, context)`
   - Looks up target session UUID
   - Builds context wrapper message
   - Invokes `sendToClaudeSession()`

3. **Integrate into `BotManager.handleMessage()`**
   - Check for delegation triggers before processing message normally
   - Route to `DelegationManager` if trigger detected

4. **Testing**
   - User → MattyAtlas: "tell Finn to create hello world function"
   - Verify Finn's response appears in Finn's chat
   - Verify context is preserved

---

### Phase 2: Multi-Platform User Identity
**Estimated Time:** 1-2 hours

1. **Create `UserIdentityManager` class**
   - Storage: JSON file or SQLite database
   - Methods:
     - `resolveUserId(platform, platformUserId)` → internalUserId
     - `registerUser(platform, platformUserId, internalUserId)`
     - `isPrivateUser(platform, platformUserId)` → boolean

2. **Update `SessionManager`**
   - Add optional `userIdentityManager` parameter
   - Change `getSessionId()` to use resolved user ID

3. **Update `BotManager.handleMessage()`**
   - Line 164: Change `msg.from.id` to `userIdentityManager.resolveUserId('telegram', msg.from.id)`

4. **Configuration**
   - Add private user mapping to `bots.json` or separate config file
   - Example:
     ```json
     {
       "privateUsers": {
         "telegram-123456": "user-bryan-123",
         "discord-789012": "user-bryan-123"
       }
     }
     ```

---

### Phase 3: Group Chat Support
**Estimated Time:** 2-3 hours

1. **Add chat context detection**
   - Create `getChatContext(msg)` helper
   - Detect private vs group chat
   - Determine session scope and response mode

2. **Update message handler filtering**
   - In `BotManager.handleMessage()`:
     - Get chat context
     - If group chat + not mentioned → return early
     - If group chat + mentioned → strip mention and proceed

3. **Session scope handling**
   - Support both shared group memory and individual memory modes
   - Add configuration option in brain files

4. **Cross-bot delegation in groups**
   - Enable bots to mention each other in group chats
   - Example: MattyAtlas says "@finnshipley build X" in group → Finn responds in same thread

---

## File Changes

### New Files
- `lib/user-identity-manager.js` - Multi-platform user identity resolution
- `lib/delegation-manager.js` - Cross-bot task delegation
- `lib/chat-context.js` - Chat type detection and response filtering
- `CROSS-BOT-DELEGATION-PLAN.md` - This document

### Modified Files
- `lib/bot-manager.js`
  - Add delegation trigger detection
  - Add user identity resolution
  - Add chat context filtering
- `lib/session-manager.js`
  - Optional: Add user identity manager integration
- `brains/mattyatlas.js`
  - Add delegation command patterns

### Configuration Files
- `bots.json` or new `users.json`
  - Add private user mapping configuration

---

## Backward Compatibility

**Critical Requirement:** All existing functionality must continue working without changes.

**Guarantees:**
1. **Existing sessions:** Continue using raw platform IDs if no user identity mapping exists
2. **Public bots:** Operate exactly as before - no delegation, no cross-platform
3. **Private chats:** Respond to every message (existing behavior)
4. **No database migrations:** All changes are additive

**How it's achieved:**
- `UserIdentityManager.resolveUserId()` returns raw platform ID if no mapping exists
- Delegation triggers are opt-in (only in MattyAtlas brain)
- Group chat logic only activates for group chat types
- All new classes/managers are optional dependencies

---

## Use Cases

### Use Case 1: Single-Platform Cross-Bot Delegation
**Scenario:** User on Telegram wants MattyAtlas to delegate coding to Finn

**Flow:**
1. User → MattyAtlas (Telegram): "tell Finn to create a REST API for user auth"
2. MattyAtlas detects trigger
3. MattyAtlas → Finn's session: "Task from MattyAtlas: create REST API for user auth. [context]"
4. Finn executes task
5. Finn → User (Telegram): "I've created the REST API. Here's the code..."

---

### Use Case 2: Multi-Platform Unified Identity
**Scenario:** User chats with MattyAtlas on Telegram, then Finn on Discord

**Setup:**
```json
{
  "telegram-123456": "user-bryan",
  "discord-789012": "user-bryan"
}
```

**Flow:**
1. User → MattyAtlas (Telegram): Discusses project architecture
2. User → Finn (Discord): "implement the auth system we discussed"
3. Finn has access to session `(finnshipley, user-bryan)` - can reference architecture discussion
4. MattyAtlas on Telegram can delegate to Finn's Discord session seamlessly

---

### Use Case 3: Group Chat Collaboration
**Scenario:** User creates Discord server with MattyAtlas, Finn, and other bots

**Setup:**
- All bots in shared Discord channel
- Group chat mode enabled
- Session scope: per-user (each bot remembers each user individually)

**Flow:**
1. User in Discord: "@mattyatlas what's the best architecture for this feature?"
2. MattyAtlas responds in thread
3. User: "@finnshipley implement what MattyAtlas suggested"
4. Finn reads group context and implements
5. User: "@priest what are the ethical implications?"
6. Priest bot responds with philosophical perspective
7. All bots have individual memory of this user + shared group context

---

## Security Considerations

### Session Isolation
- Cross-bot delegation only works within same user namespace
- Bot A cannot access Bot B's sessions for different users
- Session UUIDs remain isolated by `(botId, userId)` pair

### Permission Model
- Private user mappings stored securely
- Only authorized platforms can resolve to master user ID
- Public bots cannot be forced into private user namespace

### Rate Limiting
- Prevent delegation loops (Bot A → Bot B → Bot A → ...)
- Track delegation depth (max 3 levels recommended)
- Add cooldown between delegations

---

## Testing Plan

### Phase 1 Tests
- [ ] MattyAtlas detects delegation trigger correctly
- [ ] Target bot session is invoked with correct UUID
- [ ] Context wrapper is properly formatted
- [ ] Response appears in target bot's chat
- [ ] Session persistence works across delegations

### Phase 2 Tests
- [ ] User identity resolves correctly for private users
- [ ] Public bots continue using raw platform IDs
- [ ] Same user on multiple platforms shares sessions
- [ ] Session metadata tracks platform origins

### Phase 3 Tests
- [ ] Bots ignore non-mention messages in groups
- [ ] Bots respond when mentioned in groups
- [ ] Group session scope works (shared memory)
- [ ] Individual session scope works (private memory)
- [ ] Cross-bot delegation works in group chats

---

## Future Enhancements

### 1. Bot-to-Bot Communication Protocol
- Structured message format for inter-bot communication
- Standardized task status reporting
- Result confirmation and error handling

### 2. Workflow Orchestration
- Define multi-bot workflows in config
- Example: User request → MattyAtlas (planning) → Finn (coding) → Priest (review)
- Automatic task routing based on bot capabilities

### 3. Shared Knowledge Base
- Bots can read/write to shared memory space
- Project context accessible across all bots
- Document versioning and conflict resolution

### 4. Web Dashboard
- Visual representation of bot interactions
- Real-time session monitoring
- Manual delegation triggering
- Session history and analytics

---

## Notes & Considerations

### Why This Architecture Works
1. **Existing infra is perfect:** Session isolation via UUIDs + `--resume` flag already handles everything
2. **Telegram is just display:** Core logic is platform-agnostic
3. **No DB changes needed:** File-based session storage scales fine for this use case
4. **Minimal code changes:** ~200 lines of new code, ~10 lines of modifications

### Potential Issues
1. **Session staleness:** If Finn's session hasn't been used recently, context might be cold
   - Solution: Session warming - periodically ping sessions to keep context loaded
2. **Context size limits:** Long delegation chains might exceed Claude's context window
   - Solution: Summarization layer for context compression
3. **Response routing:** If user has multiple active chats (Telegram + Discord), which one receives response?
   - Solution: Track "active platform" in session metadata

---

## Timeline

**Total Estimated Time:** 5-8 hours

- **Phase 1 (Cross-Bot Delegation):** 2-3 hours
- **Phase 2 (Multi-Platform):** 1-2 hours
- **Phase 3 (Group Chat):** 2-3 hours

**Recommended Approach:**
1. Build Phase 1 first - prove the concept works
2. Test thoroughly with single platform
3. Add Phase 2 once delegation is stable
4. Phase 3 can be deferred if not immediately needed

---

## Success Metrics

### Phase 1 Success
- User can delegate tasks from MattyAtlas to Finn
- Response appears in correct chat
- Session context is preserved
- No errors or race conditions

### Phase 2 Success
- Same user on Telegram + Discord shares session state
- Bots maintain context across platforms
- Public bots unaffected by identity resolution

### Phase 3 Success
- Bots coexist in group chats without spam
- Mention-based invocation works reliably
- Cross-bot delegation works in groups
- Session scope (shared vs individual) works as configured

---

## Questions to Resolve

1. **Session scope in groups:** Shared group memory vs individual user memory?
   - Recommendation: Make it configurable per brain

2. **Delegation depth limit:** How many levels of bot→bot→bot delegation?
   - Recommendation: 3 levels max, track in metadata

3. **Response routing:** If user active on multiple platforms, where does response go?
   - Recommendation: Most recent platform interaction wins

4. **Error handling:** What happens if target bot's session doesn't exist?
   - Recommendation: Create new session with delegation context as first message

---

**End of Document**
