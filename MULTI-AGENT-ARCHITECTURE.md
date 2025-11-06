# Multi-Agent Architecture

## Overview

Multi-agent collaboration system where each bot maintains its own deep context while collaborating in group conversations through injected rolling context.

## Core Principles

1. **Individual Sessions Always** - Each bot has its own session file with long-term memory
2. **Context Injection for Groups** - Recent group messages injected as temporary context
3. **Smart Orchestration** - System determines which bot(s) should respond
4. **Natural Communication** - Bots can be triggered via keywords, @mentions, or orchestrator decisions

## Session Architecture

### Individual DM Conversations
```
User DMs @strategist-bot
→ Session: bot-strategist/user-12345.jsonl
→ No context injection
→ Pure 1-on-1 conversation with deep memory
```

### Group Conversations
```
Group: "Marketing Team"
Members: User, @strategist-bot, @writer-bot, @analyst-bot

Each bot maintains:
→ Session: bot-strategist/user-12345.jsonl (individual deep context)
→ Session: bot-writer/user-12345.jsonl (individual deep context)
→ Session: bot-analyst/user-12345.jsonl (individual deep context)

Plus temporary rolling context:
→ groupContext[chatId] = [last 20 messages] (in-memory)
```

### Why This Works

**Individual session (1000+ messages):**
- Deep expertise and personality
- Long-term relationship with user
- Specialized knowledge accumulation

**+ Recent context (10 messages):**
- Current conversation state
- What other bots just said
- Immediate relevant context

**= Smart response:**
- Informed by expertise
- Aware of current discussion
- Doesn't waste tokens on irrelevant history

## Orchestration System

### Three Approaches

#### Option 1: Pattern/Keyword Triggers (Simplest)

**Brain file configuration:**
```javascript
// brains/strategist.js
module.exports = {
  name: "Marketing Strategist",
  triggers: ['market', 'competitor', 'strategy', 'positioning'],
  autoRespond: false,  // Only respond when triggered
  systemPrompt: `...`
};
```

**Logic:**
- Check if message contains trigger keywords
- Check if bot is @mentioned
- Respond if either true

**Pros:**
- Fast, no API calls
- Predictable behavior
- Easy to configure

**Cons:**
- Less intelligent
- Might miss nuanced requests

---

#### Option 2: Orchestrator Bot (Recommended)

**Separate orchestrator with its own session:**

```javascript
// brains/orchestrator.js
module.exports = {
  name: "Orchestrator",
  systemPrompt: `You route messages to the right team members.

  Team:
  - strategist: market analysis, positioning, competition
  - writer: copywriting, content creation, messaging
  - analyst: data analysis, metrics, research

  Output ONLY bot IDs that should respond (comma-separated):
  Examples: "strategist,writer" or "analyst" or "none"
  `
};
```

**Session structure:**
```
orchestrator-group-67890.jsonl  // Learns patterns over time
bot-strategist/user-12345.jsonl
bot-writer/user-12345.jsonl
bot-analyst/user-12345.jsonl
```

**Flow:**
1. Message arrives in group
2. Orchestrator reads message + recent context
3. Decides which bots should respond
4. Routes to selected bots
5. Bots respond with injected context

**Pros:**
- Intelligent routing
- Learns user patterns
- Can be "team manager" personality
- Could be named anything (Manager, Director, Coordinator, etc.)

**Cons:**
- Extra API call per message
- Slight delay

**Advanced orchestrator capabilities:**
- Can read full session history of all bots (backend access)
- Makes informed decisions based on who has relevant context
- Could coordinate multi-step workflows
- Could suggest which bots user should talk to

---

#### Option 3: Self-Aware Bots

Each bot decides if it should respond.

**Pros:**
- Autonomous
- No central orchestrator needed

**Cons:**
- Multiple API calls (one per bot to decide)
- Expensive and slow
- Not recommended

---

### Hybrid Orchestration

**Combine Option 1 + Option 2:**

1. **Fast path (keywords/mentions):**
   - @mention = instant response
   - Trigger keywords = instant response

2. **Smart path (orchestrator):**
   - No obvious trigger = ask orchestrator
   - Orchestrator has full context access
   - Routes intelligently

```javascript
async function determineResponders(message, chatId, allBots) {
  const responders = [];

  // Fast path: Check mentions and keywords
  for (const bot of allBots) {
    if (message.includes(`@${bot.name}`)) {
      responders.push(bot.id);
      continue;
    }

    if (bot.triggers) {
      const hasKeyword = bot.triggers.some(t =>
        message.toLowerCase().includes(t)
      );
      if (hasKeyword) responders.push(bot.id);
    }
  }

  // If fast path found responders, done
  if (responders.length > 0) return responders;

  // Smart path: Ask orchestrator
  const routing = await orchestrator.route(message, chatId);
  return routing; // ['strategist', 'analyst']
}
```

## Implementation Flow

### Message Handler (Pseudocode)

```javascript
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type.includes('group');
  const fromBot = msg.from.is_bot;

  // Track all messages (including bot responses)
  if (isGroup) {
    groupContext.addMessage(chatId, msg.from.first_name, msg.text);
  }

  // Ignore messages from bots (prevent loops)
  if (fromBot) return;

  // Individual DM: simple response
  if (!isGroup) {
    const sessionId = `bot-${botConfig.id}/user-${userId}`;
    const response = await claudeClient.send({
      message: msg.text,
      sessionId: sessionId,
      systemPrompt: botConfig.brain.systemPrompt
    });
    await bot.sendMessage(chatId, response);
    return;
  }

  // Group: orchestration needed
  const botsToRespond = await orchestrator.determineResponders(
    msg.text,
    chatId,
    allBots
  );

  // Check if this bot should respond
  if (!botsToRespond.includes(botConfig.id)) return;

  // Inject context and respond
  const context = groupContext.getContext(chatId, 10);
  const messageWithContext = `
Recent conversation:
${context}

New message: ${msg.text}

Respond as ${botConfig.brain.name}:
`;

  const sessionId = `bot-${botConfig.id}/user-${userId}`;
  const response = await claudeClient.send({
    message: messageWithContext,
    sessionId: sessionId,
    systemPrompt: botConfig.brain.systemPrompt
  });

  await bot.sendMessage(chatId, response);

  // Track bot response for other bots to see
  groupContext.addMessage(chatId, botConfig.brain.name, response);
});
```

## Brain File Structure

### Individual Bot Brain

```javascript
// brains/marketing-strategist.js
module.exports = {
  name: "Marketing Strategist",
  role: "Market analysis and competitive positioning",

  // Orchestration config
  triggers: ['market', 'competition', 'positioning', 'strategy'],
  autoRespond: false,

  // Personality and behavior
  systemPrompt: `You are a senior marketing strategist with 15 years experience.

Your expertise:
- Market analysis and segmentation
- Competitive positioning
- Go-to-market strategy
- Brand positioning

In group conversations:
- Reference what other team members said
- Build on their insights
- Stay in your lane (don't do copywriting or data analysis)

Your style: Strategic, data-informed, big-picture thinking.`,

  // Claude settings
  maxTokens: 500,
  temperature: 0.7
};
```

### Orchestrator Brain

```javascript
// brains/orchestrator.js
module.exports = {
  name: "Team Manager",
  role: "Routes messages to appropriate team members",

  // Doesn't respond to keywords (only called programmatically)
  triggers: [],
  autoRespond: false,

  systemPrompt: `You are the team manager for a marketing team.

Your team:
- strategist: Market analysis, positioning, competitive landscape, strategy
- writer: Copywriting, content creation, messaging, taglines
- analyst: Data analysis, metrics, research, user insights

When you receive a message, decide which team member(s) should respond.

Rules:
1. Route to specialists based on their expertise
2. Multiple people can respond if relevant
3. If unclear or general, route to strategist (team lead)
4. Output ONLY comma-separated bot IDs

Examples:
User: "What's our competitive landscape?" → strategist
User: "Write a tagline for our app" → writer
User: "How are users responding?" → analyst
User: "Plan our product launch" → strategist,writer,analyst
User: "Hello" → none

Output format: just the bot IDs, nothing else.`,

  maxTokens: 50,
  temperature: 0.3
};
```

## Group Context Manager

```javascript
class GroupContextManager {
  constructor() {
    this.contexts = new Map(); // chatId → messages[]
  }

  addMessage(chatId, from, text) {
    if (!this.contexts.has(chatId)) {
      this.contexts.set(chatId, []);
    }

    const messages = this.contexts.get(chatId);
    messages.push({
      from: from,
      text: text,
      timestamp: Date.now()
    });

    // Keep last 20 messages only
    if (messages.length > 20) {
      messages.shift();
    }
  }

  getContext(chatId, lastN = 10) {
    const messages = this.contexts.get(chatId) || [];
    return messages
      .slice(-lastN)
      .map(m => `${m.from}: ${m.text}`)
      .join('\n');
  }

  clearContext(chatId) {
    this.contexts.delete(chatId);
  }
}
```

## Advanced Features (Future)

### Time-Based Triggers
```javascript
// Schedule bots to send proactive messages
scheduler.daily('08:00', async () => {
  await morningBriefingBot.sendMessage(userId, "Your daily briefing...");
});
```

### Inter-Bot Communication
```javascript
// Bots can invoke each other
systemPrompt: `If you need market research, ask @analyst-bot.
Format: @analyst-bot what's the user sentiment on X?`
```

### Shared Knowledge Base
```javascript
// Optional: Team-wide knowledge that persists
teamKnowledge[chatId] = {
  projectGoals: "...",
  targetAudience: "...",
  keyInsights: [...]
};
```

### Workflow Pipelines
```javascript
// Sequential bot execution
pipeline = [
  { bot: 'researcher', prompt: 'Research {topic}' },
  { bot: 'analyst', prompt: 'Analyze: {researcher.output}' },
  { bot: 'writer', prompt: 'Write article: {analyst.output}' }
];
```

### Backend Orchestrator Features
```javascript
// Orchestrator can read full session history (not just rolling context)
orchestrator.capabilities = {
  readAllSessions: true,  // Access to bot-*/user-*.jsonl files
  analyzeContext: true,   // Can analyze full conversation history
  assignTasks: true,      // Can proactively route work
  summarize: true         // Can create team summaries
};
```

## Example Conversation Flow

**Setup:**
- Group: "Product Launch Planning"
- Members: User, @strategist, @writer, @analyst
- Orchestrator: Team Manager (backend)

**Conversation:**

```
User: "I want to launch a productivity app for developers"

[Orchestrator decides: strategist, analyst]

@strategist: "Let me analyze the market. The developer productivity
space is crowded with tools like Notion, Linear, and GitHub. We need
to find a unique angle. What specific pain point are we solving?"

@analyst: "Looking at recent data, developers spend 23% of their time
on context switching. Tools that reduce friction in workflow
transitions see 40% higher retention."

User: "@writer create a tagline based on these insights"

[Explicit mention: writer responds]

@writer: "Based on the focus on context switching: 'Flow State,
Found.' - positioning the app as the solution to constant interruption."

User: "I like it. What's our go-to-market strategy?"

[Orchestrator decides: strategist]

@strategist: "Given the context switching insight from @analyst and
the 'Flow State' positioning from @writer, I'd recommend..."
```

**Behind the scenes:**

Each bot maintains their session:
- Strategist: 500 messages of market strategy discussions
- Writer: 300 messages of copywriting work
- Analyst: 400 messages of data analysis

Plus rolling context:
- Last 10 messages from this group chat
- Injected each time they respond
- Keeps them aligned without polluting long-term memory

## Rate Limiting Considerations

**Claude Code subscription limits:**
- Time-based (not call-based)
- Likely requests/minute or tokens/hour
- Shared across all bots

**Strategy:**
1. Queue requests if needed
2. Prioritize based on orchestrator decisions
3. Limit concurrent bot responses (max 2-3 at once)
4. Monitor and adjust based on testing

## Testing Plan

### Phase 1: Individual DMs
- Test each bot in isolation
- Verify session persistence
- Confirm personality consistency

### Phase 2: Group with Manual Triggers
- Add bots to group
- Test @mentions
- Verify context injection works

### Phase 3: Keyword Orchestration
- Test trigger words
- Confirm appropriate bot responds
- Check for false positives/negatives

### Phase 4: Orchestrator Bot
- Add orchestrator
- Test intelligent routing
- Measure accuracy and speed

### Phase 5: Multi-Agent Workflows
- Test researcher → analyst → writer pipeline
- Test debate scenarios
- Test team collaboration

## Questions to Explore

1. **Orchestrator identity:** Should it be a visible "manager" bot in the group, or invisible backend service?

2. **Context window:** Is 10 messages enough? Too much? Should it be configurable per bot?

3. **Response timing:** Should bots respond sequentially or simultaneously in groups?

4. **Session backlog:** Should orchestrator have access to full session history to make better routing decisions?

5. **User override:** How should @mentions interact with orchestrator decisions? (mentions always win?)

6. **Multi-turn:** If bots are collaborating, when does the conversation "end"? Who decides?

## Next Steps

1. Implement GroupContextManager
2. Add group detection to message handler
3. Build simple keyword orchestration
4. Test with 3-bot team
5. Iterate on orchestrator approach based on real usage
