# Phase 2: Bot-as-a-Service - Implementation Spec

## Vision

**"The simplest, cheapest way to create a Telegram bot"**

- Create bot in 60 seconds
- Radically simple (3 inputs: Name, Personality, Token)
- Radically cheap ($10/mo base, $25/mo premium)
- Competitor pricing: $20-100/mo
- Our edge: Zero marginal cost per bot (sharing Claude subscriptions)

---

## Product Positioning

### The "Carrd of Chatbots"

**What Carrd did for websites:**
- Made it stupidly simple (vs WordPress complexity)
- Made it cheap ($9/year vs $100+/year)
- Focused on speed (site live in 5 minutes)

**What we do for chatbots:**
- Stupidly simple (3 inputs vs complex bot builders)
- Cheap ($10/mo vs $20-100/mo)
- Fast (bot live in 60 seconds)

### Target Customer

**NOT:** Enterprises, developers, agencies
**YES:** Small business owners, creators, solo entrepreneurs, communities

**Use cases:**
- Telegram community moderator/FAQ bot
- Creator's personal assistant bot
- Small business customer support
- Course creator enrollment bot
- Simple personal productivity bot

**What they care about:**
- ✅ Works fast
- ✅ Cheap
- ✅ No coding
- ❌ Don't care about "MCP tools" or technical details

---

## MVP Scope (Weeks 1-4)

### Goal

Launch with **20-30 paying customers** in 4 weeks.

Prove:
1. People will pay $10-25/mo for simple bots
2. Our cost structure works (profitable at scale)
3. Shared Claude subscription model works

### What We're Building

**Landing page:**
- Hero: "Create Your AI Telegram Bot in 60 Seconds"
- Simple 3-field form
- Pricing: $10/mo base, $25/mo premium
- "Limited beta: 30 spots" (creates urgency + caps our risk)

**Onboarding flow:**
1. Sign up (email + payment via Stripe)
2. Fill form:
   - Bot name
   - Personality (dropdown templates OR custom)
   - Telegram bot token (with "Get token" helper link)
3. Click "Deploy Bot"
4. Bot is live in 30-60 seconds
5. Confirmation email with bot link

**Backend:**
- Multi-tenant bot manager (isolate customers)
- ONE Claude subscription ($200 Claude Team)
- Static assignment: Each customer → that Claude account
- Session files: `~/.claude/projects/customer-{id}-bot/...`
- Simple rate limits per customer (track in Redis/Supabase)

**Features:**
- Bot works in Telegram DMs
- Remembers conversations (session persistence)
- Has personality (via brain file)
- That's it for base tier

**Premium features ($25/mo):**
- Image generation (via MCP or Stable Diffusion API)
- Web search (via MCP)
- Custom personality (write your own vs templates)
- Higher message limits (3× base tier)
- Priority support

### What We're NOT Building Yet

❌ Multiple Claude account load balancing
❌ Session migration between accounts
❌ Dedicated Claude accounts per customer
❌ Enterprise tier
❌ Group chat support (DMs only)
❌ Multi-bot per customer
❌ Analytics dashboard
❌ White-label
❌ API access

**Why:** Ship fast, learn fast, iterate based on real customer feedback.

---

## Economics & Pricing

### Cost Structure

**Fixed costs:**
- Claude Team subscription: $200/mo
- Hosting (Cloudflare Workers/Railway): $20/mo
- **Total: $220/mo**

**Marginal cost per customer:** $0
- They share the Claude subscription
- No per-message API costs
- No per-user infrastructure costs

### Revenue Model

**Tier 1: Base ($10/mo)**
- X messages per day (TBD based on testing)
- Template personalities only
- Basic support

**Tier 2: Premium ($25/mo)**
- 3× messages per day
- Image generation
- Web search
- Custom personality
- Priority support

### Target Customer Mix

**Conservative scenario (20 customers):**
```
15 customers × $10/mo = $150
5 customers × $25/mo  = $125
Total revenue: $275/mo
Total costs: $220/mo
Profit: $55/mo
```

**Growth scenario (30 customers):**
```
20 customers × $10/mo = $200
10 customers × $25/mo = $250
Total revenue: $450/mo
Total costs: $220/mo
Profit: $230/mo
```

**Scale scenario (50 customers on one account):**
```
30 customers × $10/mo = $300
20 customers × $25/mo = $500
Total revenue: $800/mo
Total costs: $220/mo
Profit: $580/mo
```

### Break-Even Analysis

**Break even at:** 22 customers at $10/mo OR 9 customers at $25/mo

**Goal for first month:** 20 customers (any mix)

---

## Unknowns & Testing Required

### Critical Unknowns (MUST test before launch)

#### 1. Claude Subscription Rate Limits

**Question:** How many messages can one Claude Team ($200/mo) account handle?

**Test plan:**
```
Week 1, Days 1-3:
- Create load test script
- Simulate 5-10 bots sending messages simultaneously
- Track messages/hour before rate limiting
- Document actual limits
```

**What we need to know:**
- Messages per hour limit?
- Messages per day limit?
- Concurrent request limit?
- How long do rate limits last?

**This determines:** How many customers we can support per Claude account

---

#### 2. Session Portability (Nice to know, not blocking)

**Question:** Can Claude Account B resume a session created by Account A?

**Test plan:**
```
Day 4-5:
- Create session on Account A: claude --print "test" --session-id test-123
- Try resuming on Account B: claude --resume test-123 --print "follow up"
- Does it work?
```

**Likely answer:** No, sessions are account-locked

**Backup plan:** Session migration via content injection (see below)

---

#### 3. Session Migration Feasibility

**Question:** Can we migrate sessions between accounts by reading/injecting content?

**Approach:**
```javascript
// Read session from Account A
const sessionPath = '~/.claude/projects/bot-xyz/user-123.jsonl';
const history = readJSONL(sessionPath); // Array of messages

// Create new session on Account B with history injected
const newSession = await claudeClient.send({
  message: serializeHistory(history) + "\n\nUser: " + newMessage,
  claudeAccount: 'B'
});
```

**Test plan:**
```
Day 6-7:
- Create 10-message conversation on Account A
- Read session file
- Start new session on Account B with full history
- Send new message
- Verify Claude has full context from previous 10 messages
```

**Why this matters:** Enables future load balancing between accounts

**For MVP:** Not needed, just assign customers statically to one account

---

### Non-Critical Unknowns (Learn from customers)

**What personalities do people actually want?**
- Start with 5 templates (friendly, professional, funny, supportive, technical)
- See which get used most
- Add more based on demand

**What's the right message limit?**
- Start conservative (20-50 messages/day for $10 tier)
- Monitor actual usage
- Adjust based on data

**Do people want premium features?**
- Launch with image gen + web search as premium
- Track conversion rate ($10 → $25)
- Add more features if conversion is low

---

## Technical Architecture (MVP)

### Stack

**Frontend:**
- Next.js landing page + signup flow
- Hosted on Vercel (free tier)
- Stripe integration for payments

**Backend:**
- Node.js bot manager (existing codebase)
- ONE Claude Team account ($200/mo)
- Redis for rate limiting (Upstash free tier)
- Supabase for customer data (free tier)

**Infrastructure:**
- Cloudflare Workers OR Railway ($10-20/mo)
- Persistent process running bot manager
- Webhooks for Stripe events

### Database Schema

```sql
-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  stripe_customer_id TEXT,
  tier TEXT DEFAULT 'base', -- 'base' or 'premium'
  status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'past_due'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bots
CREATE TABLE bots (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  name TEXT,
  telegram_token TEXT,
  brain_config JSONB, -- Personality + settings
  claude_account TEXT DEFAULT 'A', -- Which Claude account
  created_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);

-- Usage tracking (for rate limiting)
CREATE TABLE usage (
  customer_id UUID REFERENCES customers(id),
  bot_id UUID REFERENCES bots(id),
  date DATE DEFAULT CURRENT_DATE,
  message_count INT DEFAULT 0,
  PRIMARY KEY (customer_id, bot_id, date)
);

-- Sessions (optional metadata, actual sessions are .jsonl files)
CREATE TABLE sessions (
  user_id TEXT, -- Telegram user ID
  bot_id UUID REFERENCES bots(id),
  session_uuid TEXT,
  claude_account TEXT, -- Which account this session lives on
  message_count INT DEFAULT 0,
  last_message_at TIMESTAMP,
  PRIMARY KEY (user_id, bot_id)
);
```

### Bot Deployment Flow

```javascript
// When customer creates bot:

async function deployBot(customerId, botConfig) {
  // 1. Generate brain file
  const brainFile = generateBrainFile({
    name: botConfig.name,
    personality: botConfig.personality,
    tier: customer.tier
  });

  // 2. Save to database
  const bot = await db.bots.create({
    customerId,
    name: botConfig.name,
    telegramToken: botConfig.token,
    brainConfig: brainFile,
    claudeAccount: 'A' // For MVP, everyone on Account A
  });

  // 3. Start bot instance
  await botManager.addBot({
    id: bot.id,
    token: botConfig.token,
    brain: brainFile,
    claudeAccount: 'A'
  });

  // 4. Verify bot is running
  const isRunning = await botManager.checkBot(bot.id);

  return { success: true, botId: bot.id };
}
```

### Rate Limiting

```javascript
// Before sending message to Claude:

async function checkRateLimit(customerId, botId) {
  const customer = await db.customers.get(customerId);
  const usage = await db.usage.getToday(customerId, botId);

  const limits = {
    base: 50,      // 50 messages/day
    premium: 150   // 150 messages/day
  };

  const limit = limits[customer.tier];

  if (usage.messageCount >= limit) {
    return {
      allowed: false,
      message: `Daily limit reached (${limit} messages). Upgrade to Premium for more.`
    };
  }

  return { allowed: true, remaining: limit - usage.messageCount };
}

// After successful response:
async function incrementUsage(customerId, botId) {
  await db.usage.increment(customerId, botId);
}
```

---

## MVP Timeline (4 Weeks)

### Week 1: Testing & Frontend

**Days 1-3: Rate Limit Testing**
- Build load test script
- Test Claude Team account limits
- Document findings
- Calculate customer capacity

**Days 4-7: Landing Page**
- Design landing page (inspiration: Carrd, Gumroad, simple SaaS)
- Build with Next.js
- 3-field form
- Stripe integration (test mode)
- Deploy to Vercel

**Deliverable:** Landing page live, can collect emails (no bot deployment yet)

---

### Week 2: Backend & Bot Deployment

**Days 8-10: Multi-Tenant Bot Manager**
- Modify existing bot-manager.js for multi-tenancy
- Add customer isolation (session paths, brain files)
- Add rate limiting middleware
- Test with 3 simulated customers

**Days 11-14: Bot Deployment System**
- API endpoint: POST /api/deploy-bot
- Generate brain files from form input
- Start bot instance
- Verify bot is running
- Return success/failure

**Deliverable:** Can deploy a bot via API call

---

### Week 3: Integration & Testing

**Days 15-17: Frontend ↔ Backend Integration**
- Connect form submission to deployment API
- Handle loading states, errors
- Confirmation page + email
- Test full flow end-to-end

**Days 18-21: Beta Testing**
- Deploy to production (Railway/Cloudflare)
- Invite 5 friends/beta testers
- Create bots, test conversations
- Fix bugs, polish UX

**Deliverable:** 5 real bots running for beta users

---

### Week 4: Launch

**Days 22-24: Pre-Launch Polish**
- Support docs (FAQ, troubleshooting)
- Onboarding emails
- Social media assets (screenshots, demo video)
- Launch post drafts (Reddit, Twitter, Product Hunt)

**Days 25-28: Launch Week**
- Soft launch: Twitter, personal network
- Post to Reddit (r/Telegram, r/SideProject, r/EntrepreneurRideAlong)
- Product Hunt launch (Day 27-28)
- Goal: 10-20 paying customers by end of week

**Deliverable:** First paying customers, revenue

---

## Launch Marketing Plan

### Pre-Launch (Week 3-4)

**Build in public:**
- Tweet progress updates
- Share screenshots
- Share "build story" (2 hours for Phase 1, etc.)
- Build small following

**Prepare assets:**
- 60-second demo video
- Screenshots of bot creation flow
- Screenshot of bot conversation
- Comparison chart (us vs competitors)

### Launch Day

**Reddit posts:**
- r/Telegram: "I built the simplest way to create a Telegram bot"
- r/SideProject: "Launched: Create AI bots in 60 seconds for $10/mo"
- r/EntrepreneurRideAlong: "My bootstrapped chatbot SaaS"

**Twitter:**
- Launch thread with screenshots + demo
- Tag relevant accounts
- Use hashtags: #buildinpublic #indiehackers #SaaS

**Product Hunt:**
- Launch as "maker"
- Respond to all comments
- Goal: Top 10 of the day

### Post-Launch (Ongoing)

**Content marketing:**
- Blog post: "How I undercut chatbot builders by 50%"
- Tutorial: "Create a Telegram bot in 60 seconds"
- Use case guides: "5 bots for Telegram communities"

**Community engagement:**
- Telegram groups about bots
- Discord servers for creators
- Respond to "how do I make a bot" questions with helpful answer + subtle plug

---

## Success Metrics (First Month)

### Must Have (MVP Validation)
- ✅ 20 paying customers
- ✅ $200+ MRR (Monthly Recurring Revenue)
- ✅ <5% churn rate
- ✅ No critical bugs/outages
- ✅ Claude rate limits understood and managed

### Nice to Have (Growth Signals)
- 🎯 30+ customers
- 🎯 $400+ MRR
- 🎯 25%+ conversion to premium ($10 → $25)
- 🎯 5+ organic customer testimonials
- 🎯 Product Hunt top 10

### Learn (Customer Insights)
- What personalities are most popular?
- What use cases are people building for?
- Do people upgrade to premium? Why/why not?
- What features do they request?
- Where did customers hear about us?

---

## Future Phases (Post-MVP)

### Phase 2.5: Scale & Premium Features (Weeks 5-8)

**If MVP is successful (20+ customers):**

**Add:**
- Second Claude account (load balance across 2 accounts)
- More personality templates
- Analytics dashboard (message count, popular times)
- Webhook support (notify customer when bot gets message)

**Optimize:**
- Conversion funnel ($10 → $25)
- Onboarding experience
- Support documentation

**Goal:** 50-100 customers, $500-1000 MRR

---

### Phase 3: Multi-Agent Teams (Weeks 9-16)

**If there's customer demand:**

**New tier: $99/mo "Teams"**
- Create teams of bots that collaborate
- Group chat support
- Orchestration modes (free-form, pipeline, managed)
- Premium positioning

**This becomes the differentiated product:**
- Competitors don't have this
- Higher margin ($99 vs $25)
- Harder to copy

**See:** MULTI-AGENT-ARCHITECTURE.md for full spec

---

### Phase 4: Enterprise & API (Later)

**If scale is proven:**

**Add:**
- Dedicated Claude accounts ($49-99/mo tier)
- API access for developers
- White-label options
- Team collaboration features
- SSO / enterprise auth

---

## Open Questions & Decisions Needed

### Branding & Domain

**Name options:**
- BotBuddy
- QuickBot
- SnapBot
- BotKit
- SimpleBot
- InstantBot

**Criteria:**
- .com domain available
- Easy to remember
- Communicates speed/simplicity

**Decision needed:** Choose name, buy domain

---

### Personality Templates

**What to offer in dropdown?**

**Draft list:**
- Friendly Assistant (general purpose)
- Customer Support (professional, helpful)
- Personal Trainer (motivational, supportive)
- Study Buddy (educational, patient)
- Creative Writer (imaginative, fun)
- Tech Support (technical, clear)
- Therapist (empathetic, listening)
- Sarcastic Friend (witty, playful)

**Decision needed:** Finalize 5-8 templates

---

### Rate Limit Strategy

**After testing, decide:**
- What's a "safe" per-customer limit on shared account?
- Should we be aggressive (more customers, risk hitting limits) or conservative (fewer customers, no risk)?
- What's the upgrade path when customer hits limit?

---

### Pricing Final Decision

**Option A: $10 base, $25 premium**
- Aggressive pricing
- Undercuts everyone
- Risk: Might not convert enough to premium

**Option B: $15 base, $29 premium**
- Safer margins
- Still competitive
- Easier to be profitable

**Option C: $10 base, $19 premium, $49 dedicated**
- Three tiers
- More upsell options
- More complex

**Decision needed:** Choose pricing after testing

---

## Session Migration (Future Consideration)

### Why We Might Need This

**Scenario 1: Load Balancing**
- Claude Account A hits 80% capacity
- New messages for customers on Account A
- Migrate some customers to Account B
- Balance load across accounts

**Scenario 2: Customer Upgrade**
- Customer on $10 shared pool (Account A)
- Upgrades to $49 dedicated tier
- Need to move their session to dedicated Account B

**Scenario 3: Account Failure/Maintenance**
- Account A gets rate limited or has issues
- Migrate active sessions to Account B
- Minimize downtime

### How It Would Work

```javascript
async function migrateSession(userId, botId, fromAccount, toAccount) {
  // 1. Read full conversation history from fromAccount
  const sessionPath = `~/.claude/projects/customer-{id}-bot/telegram-{userId}.jsonl`;
  const messages = readJSONL(sessionPath);

  // messages = [
  //   { role: 'user', content: 'Hello' },
  //   { role: 'assistant', content: 'Hi!' },
  //   ...
  // ]

  // 2. Serialize history for injection
  const historyContext = messages.map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');

  // 3. Start new session on toAccount with full history
  const newSessionResponse = await claudeClient.send({
    message: `Previous conversation:\n${historyContext}\n\nContinuing conversation...`,
    claudeAccount: toAccount,
    projectPath: getProjectPath(toAccount, botId)
  });

  // 4. Update database tracking
  await db.sessions.update(userId, botId, {
    claudeAccount: toAccount,
    sessionUuid: newSessionResponse.sessionId,
    migratedAt: new Date()
  });

  // 5. Archive old session (optional)
  await archiveSession(fromAccount, sessionPath);

  return newSessionResponse.sessionId;
}
```

### Considerations

**✅ Pros:**
- Enables dynamic load balancing
- Enables smooth tier upgrades
- Enables account failover
- Full flexibility

**⚠️ Cons:**
- Complexity (need to test thoroughly)
- Token usage (re-sending entire history)
- Potential context loss (tool calls, metadata)
- Not 1:1 identical to native session

**🧪 Testing needed:**
- Does context fully preserve? (10 message test)
- Does it work with long conversations? (50+ message test)
- Does it work with MCP tool usage? (image gen + web search test)
- What's the token cost? (compare to native session)

### Decision

**For MVP (Phase 2):**
- Don't implement migration
- Use static assignment (customer → account)
- Keep it simple

**For Scale (Phase 2.5+):**
- Test migration concept
- Implement if/when needed (50+ customers, hitting account limits)
- Monitor if load balancing becomes necessary

---

## Risk Mitigation

### Risk 1: Hit Claude Rate Limits

**Likelihood:** Medium
**Impact:** High (customers get errors)

**Mitigation:**
- Test limits thoroughly before launch
- Set customer limits conservatively (50% of actual limits)
- Monitor usage in real-time
- Have second Claude account ready to activate
- Clear upgrade path for customers who need more

---

### Risk 2: No Customer Demand

**Likelihood:** Medium
**Impact:** High (no revenue)

**Mitigation:**
- Launch with "limited beta" (creates urgency)
- Price aggressively ($10/mo - cheapest option)
- Focus on simplicity (lower barrier to try)
- Iterate based on feedback quickly
- If no traction after 1 month, pivot to multi-agent (Phase 3)

---

### Risk 3: High Support Burden

**Likelihood:** Medium
**Impact:** Medium (time sink)

**Mitigation:**
- Create comprehensive FAQ/docs
- Most common issue will be "how to get Telegram token" - make this crystal clear
- Use Intercom or Crisp for support (free tier)
- Limit to 30 customers in beta (manageable)

---

### Risk 4: Anthropic Changes ToS

**Likelihood:** Low
**Impact:** High (business model breaks)

**Mitigation:**
- We're using documented features (claude CLI, --ide flag)
- Not scraping or reverse engineering
- If ToS changes, pivot to official API (adjust pricing)
- Have Plan B ready: charge enough to cover API costs

---

### Risk 5: Competitors Copy Us

**Likelihood:** High (if successful)
**Impact:** Medium

**Mitigation:**
- They can't match our cost structure (they use API)
- Speed advantage: we ship features fast (solo founder)
- Build community and brand (personal connection)
- Add moat: multi-agent teams (Phase 3) - complex to copy

---

## Key Principles

### Ship Fast
- 4 weeks to first customers
- Don't overbuild
- Learn from real usage

### Stay Simple
- Resist feature creep
- "No" is the default answer
- Only add what customers actually ask for

### Unit Economics Matter
- Every decision through lens of: "Does this improve margins?"
- Premium features should cost us $0
- Growth should improve margins (not worsen)

### Customer-Funded Growth
- Use revenue from Phase 2 to fund Phase 3
- Don't build advanced features until customers ask
- Validate before building

---

## Appendix: Competitive Analysis

### Chatbase ($19-99/mo)
**What they offer:**
- Custom chatbots trained on your data
- Website embed
- Multi-platform (web, WhatsApp, Telegram)

**Our advantage:**
- 2× cheaper
- Simpler (no "train on data" complexity)
- Faster setup

---

### Botpress ($0-500/mo)
**What they offer:**
- Open source bot builder
- Complex workflows
- Developer-focused

**Our advantage:**
- Much simpler (non-technical users)
- Faster setup
- Better for simple use cases

---

### ManyChat ($15-145/mo)
**What they offer:**
- Telegram + WhatsApp + Instagram bots
- Visual flow builder
- Marketing automation

**Our advantage:**
- Cheaper
- Simpler (no complex flows)
- AI-native (they're bolt-on AI)

---

### CustomGPT ($49-499/mo)
**What they offer:**
- ChatGPT-powered bots
- Website embed
- Document training

**Our advantage:**
- 5-10× cheaper
- Telegram-native
- Simpler

---

## Summary

**Phase 2 Goal:** Launch simple bot-as-a-service in 4 weeks, get 20 paying customers, validate unit economics.

**Core Strategy:** Radical simplicity + radical cheapness (enabled by our zero-marginal-cost model).

**Success Looks Like:** $200+ MRR, <5% churn, customers using bots daily, testimonials we can share.

**Next Phase:** If successful → add multi-agent teams (Phase 3). If not → iterate or pivot.

**Timeline:**
- Week 1: Testing + Landing Page
- Week 2: Backend + Deployment
- Week 3: Integration + Beta
- Week 4: Launch

Let's ship it. 🚀
