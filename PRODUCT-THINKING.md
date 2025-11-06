# Product Thinking Notes

> Loose notes on positioning, market, and what this could become. Not a business plan, just context.

---

## What We Actually Built

**Not:** A better code editor
**Not:** Just another AI coding assistant
**Actually:** Conversational orchestration layer for specialized AI agents with full codebase access

---

## The Unique Combo

Most tools make you choose one:

| Tool | Conversational | Codebase Access | Multiple Agents | Agent Delegation | Roles/Specialization |
|------|---------------|-----------------|-----------------|------------------|---------------------|
| ChatGPT | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cursor | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| Claude Code | ⚠️ | ✅ | ❌ | ❌ | ❌ |
| Conductor.build | ❌ | ✅ | ✅ | ❌ | ❌ |
| AutoGPT/LangChain | ❌ | ⚠️ | ✅ | ⚠️ | ❌ |
| **This** | ✅ | ✅ | ✅ | ✅ | ✅ |

**We have all five.**

---

## Target Users (Both/And, Not Either/Or)

### Non-Technical Users
- Solo founders who can't code
- Product managers coordinating AI work
- Designers who want to build without coding
- Anyone who wants to **describe what they want** and have AI specialists collaborate

**Use case:** "I need user authentication" → Finn implements, Matty reviews UX, Rick checks security → User approves

### Technical Users
- Developers who want AI help on specific tasks
- Teams who want to augment with AI specialists
- Anyone who wants **AI team members**, not just autocomplete

**Use case:** "Implement OAuth" → delegate to Finn, ask Rick for security review, Matty for UX feedback → coordinate AI help while still writing code yourself

### Teams
- Agencies managing multiple projects
- Startups with small teams
- Anyone who needs **observable AI collaboration** with audit trails

**Use case:** Junior dev stuck → delegates to Finn, Senior dev reviews Rick's security audit, PM sees all progress in one place

---

## Positioning

### What We're NOT:
- "Better Cursor" (not competing on autocomplete)
- "Coding for non-coders" (that's a trap, sounds gimmicky)
- "AutoGPT but visible" (too technical, misses the point)

### What We ARE:
**"AI team collaboration platform with full codebase access"**

**Analogies:**
- Slack for managing AI workers
- Cursor for teams (with delegation + roles)
- Discord for AI agents who can code

**Elevator pitch:**
> Cursor gives you one AI assistant. We give you a specialized AI team. They talk to each other, share context, make decisions together. You manage them through conversation. They have full access to your code.

---

## Why This Could Actually Work

### Information Symmetry + Specialization
- All bots can access ENTIRE codebase (no silos)
- All bots can see all conversations (full context)
- But they're specialized by personality/role, not access control
- Like a team of experts with telepathy

### Observable by Default
- Every conversation visible (Telegram now, web UI later)
- Human can jump in anytime
- Audit trail of all decisions
- No black box execution

### Bring Your Own Claude
- Not managing API costs
- User just needs Claude subscription ($20-40/month)
- We're on top of Claude, not replacing it
- Much simpler business model

---

## Competitive Differentiation

**vs. Cursor:**
- They: One AI, you drive
- Us: AI team, they collaborate, you orchestrate

**vs. Conductor.build:**
- They: Multiple Claude instances, parallel work
- Us: Specialized roles, delegation, structured decision-making, consensus

**vs. ChatGPT Projects:**
- They: One AI, no codebase access
- Us: Team of AIs, full codebase access, they coordinate

**The gap:** Nobody else has **conversational orchestration + specialized roles + full codebase access + agent delegation**

---

## What Needs to Exist for This to Be a Product

### Must-haves:
- ✅ Desktop app (one-click install, no manual setup)
- ✅ Local web UI (replace Telegram)
- ✅ Git worktree isolation (bots work in separate branches)
- ✅ Workflow automation (loops, retries, approval gates)
- ✅ Good onboarding (works in 5 minutes)

### Nice-to-haves:
- Custom bot personalities (user-created)
- Workflow marketplace (share/sell templates)
- Team features (multi-user workspaces)
- Integrations (GitHub, Jira, etc.)

---

## Monetization Thoughts

**Not decided, just options:**

### Option 1: Freemium
- Free: 3 bots, basic features
- Pro ($15-20/month): Unlimited bots, custom personalities, git worktrees, advanced workflows
- Teams ($50-100/month): Multi-user, shared workspaces, audit logs

### Option 2: Free + Marketplace
- App is free
- Sell bot personalities, workflow templates
- Take 30% cut on marketplace

### Option 3: Free Forever
- Build users first
- Monetize later (enterprise features, support, consulting)

### Option 4: One-Time Purchase
- $49-99 lifetime license
- Updates for 1 year

**Current thinking:** Start free, build users, figure out monetization after product-market fit

---

## What Makes This Hard to Copy

**Not the tech** (delegation, callbacks, Claude CLI - all straightforward)

**The insight:**
- Information symmetry (all bots see everything)
- Specialization via personality (not access control)
- Observable orchestration (Slack-like, not black box)
- Conversational management (describe what you want, AI team delivers)

**The execution:**
- Bot personalities (Finn, Matty, Rick - need to be genuinely useful)
- Workflow patterns (what actually saves time?)
- UX/UI (managing AI team should feel natural)

---

## Open Questions

- Do people actually want to "manage AI workers" or is this just interesting to us?
- Is git worktree isolation necessary or just nice-to-have?
- Should bots have memory across projects or start fresh each time?
- How do we handle bots disagreeing with each other?
- What does "winning" look like - lots of users? Revenue? Acquisition?

---

## Next Steps (In Order of Impact)

1. **Use it ourselves for real projects** - Find what actually saves time
2. **Git worktree integration** - Bots work in isolated branches
3. **Desktop app + local web UI** - Remove Telegram dependency
4. **Onboarding flow** - Make it work in 5 minutes for new users
5. **Ship v0.1** - Free, get feedback, iterate

---

## Philosophy

- Build what's useful, not what's clever
- Prioritize transparency over automation
- Make it conversational, not command-line
- Iterate based on real usage, not hypotheticals
- Free first, monetize later (if ever)

---

## Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture
- [DELEGATION-SYSTEM.md](./DELEGATION-SYSTEM.md) - How delegation works
- [NOTES.md](./NOTES.md) - General ideas and future directions
