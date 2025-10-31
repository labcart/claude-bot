# Web Platform Strategy

## Core Vision
Build a **bot-as-a-service platform** that allows companies to embed custom AI companions into their websites. The Telegram bot is the proof of concept — the web platform is the monetizable product.

## The Problem
Right now, MattyAtlas lives in Telegram. B2B prospects can't experience it without:
- Installing Telegram
- Creating an account
- Finding the bot
- Context-switching from their workflow

**This is a credibility blocker, not a feature.** Companies expect web demos they can click into during meetings.

## The Solution: Three-Tier Architecture

### 1. Web Demo Site (Lead Generator)
**Purpose:** Instant proof of concept — no signup, no friction, just click and chat.

**What it needs:**
- Simple chat interface (think Intercom/Drift style)
- 3-5 example bots showcasing different personalities/use cases
- Clean branding
- Contact/inquiry form
- Mobile responsive

**Tech Stack (Suggested):**
- Frontend: React/Next.js
- Backend: Express + WebSockets (or your existing Node setup)
- Hosting: Vercel/Railway/similar
- Database: Same SQLite/Postgres you're already using

**Timeline:** 1 week for functional MVP

### 2. Embeddable Widget (The Actual Product)
**Purpose:** `<script src="yourbot.js"></script>` — drop it in, configure via dashboard, done.

**What it needs:**
- Lightweight JavaScript widget
- Configurable appearance (colors, position, branding)
- API connection to your bot backend
- Cross-domain security handled
- Analytics/usage tracking

**Similar to:** Intercom, Drift, Crisp chat widgets

### 3. Admin Dashboard (Client Management)
**Purpose:** Clients configure their bot, manage settings, view analytics, handle billing.

**What it needs:**
- Bot personality configuration
- API key management
- Usage analytics
- Billing/subscription management
- Multi-tenancy (isolated data per client)

## What Stays the Same
The core you've already built is **platform-agnostic**:
- MCP integrations (Cursor Context, TTS, Image Gen, Playwright)
- Session management and conversation state
- Database layer
- AI orchestration logic

**These don't change.** You're just swapping Telegram's bot listeners for HTTP routes + WebSockets.

## Platform Comparison

### Telegram (Current State)
✅ Zero frontend work
✅ Built-in auth, UI, media handling
✅ Fast iteration
✅ Great for testing ideas
❌ Hidden from B2B prospects
❌ Platform dependency risk
❌ Can't customize branding
❌ Can't embed in client sites

### Discord
✅ Similar bot structure to Telegram
✅ Community/server features
✅ Could ship in a weekend
❌ Still platform-dependent
❌ Still can't embed in client sites
❌ Not where B2B buyers are

### Web
✅ Total control and customization
✅ Embeddable in any site
✅ Professional credibility
✅ No platform risk
✅ Own the distribution
❌ Must build UI, auth, infrastructure
❌ More surface area to maintain
❌ Hosting/scaling considerations

## What NOT to Do
- ❌ Build 10 different bots on your demo site
- ❌ Expand to Discord before validating web
- ❌ Over-engineer the MVP
- ❌ Build features before talking to prospects
- ❌ Spread thin across multiple platforms

## What TO Do
1. **Build one killer web demo** with MattyAtlas personality
2. **Make it instantly accessible** — no signup wall
3. **Get it in front of 10 potential clients** within 2 weeks
4. **Let their feedback** tell you what to build next
5. **Then** build the embeddable widget
6. **Then** build the admin dashboard

## Technical Migration Notes

### Backend Changes
- Replace Telegraf bot listeners with Express HTTP routes
- Add WebSocket server for real-time messaging
- Implement basic auth (JWT or session-based)
- Add rate limiting and abuse prevention
- Same MCP layer, same database, same core logic

### Frontend Build
- Chat UI component (messages, input, typing indicators)
- WebSocket connection management
- Message state synchronization
- Mobile-responsive design
- Basic error handling and reconnection logic

### Estimated Effort
- **Web demo backend:** 2-3 days
- **Web demo frontend:** 3-4 days
- **Polish and deployment:** 1-2 days
- **Total MVP:** 1-2 weeks

## Success Metrics
- Can a prospect experience the bot in **under 30 seconds**?
- Can you share a URL during a sales call and demo it **live**?
- Does it work flawlessly on **mobile**?
- Can you collect **lead information** from interested prospects?

If yes to all four, you're ready to start selling.

## Next Immediate Action
Pick a chat UI framework/template (don't build from scratch) and get a basic "hello world" web chat connected to your existing backend by end of week.

Stop thinking horizontally (more platforms). Start thinking vertically (one platform, production-ready, monetizable).
