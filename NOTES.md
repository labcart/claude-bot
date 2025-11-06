# Development Notes & Ideas

> Loose collection of ideas, potential directions, and things to keep in mind. Nothing here is set in stone - just context for future iterations.

---

## ✅ What's Working Now (Phase 2)

**Bot-to-bot delegation:**
- `/team` command on Telegram
- Context sharing between bots
- Session management per bot/user

**Structured callbacks:**
- MCP tool for IDE → bot delegation
- YES/NO parsing from natural language
- Multi-bot consensus (ask 3 bots, act on majority)
- Response queue with polling
- Telegram shows everything with headers

**Technical:**
- Telegram Bot API for interface
- Claude CLI sessions for each bot
- Express server for HTTP endpoints
- MCP integration for IDE
- In-memory response queue

---

## 🤔 Potential Next Directions

### Web UI (instead of Telegram)
- Chat interface (Discord/Slack-like)
- Bot roster sidebar
- File explorer integration
- Drag-and-drop delegation
- Real-time updates (WebSocket)

**Tech:** React/Next.js, WebSocket, keep existing Express backend

**Why:** Makes it standalone, not dependent on Telegram, better UX for managing multiple bot conversations

---

### Advanced Orchestration
Once we have more usage, might want:
- Retry loops (if bot says NO, send to different bot to fix)
- Parallel task execution (delegate to 3 bots simultaneously)
- Approval gates (bot reviews before deployment)
- State machines for complex workflows

**Tech:** Workflow engine, job queue (Bull?), persistence layer

**Why:** Handle more complex multi-step tasks without manual intervention

---

### Ecosystem/Extensibility
If this gets used by others:
- Custom bot personalities (users create their own)
- Plugin system (extend bot capabilities)
- Integrations (GitHub, Jira, Slack)
- REST API for external systems

**Tech:** Plugin loader, API gateway, marketplace backend

**Why:** Let others customize and extend the system

---

### Production/Enterprise Features
Way down the line if this becomes serious:
- Multi-user support
- Authentication/authorization
- Audit logs
- Usage analytics
- Cost tracking (Claude API usage)
- High availability, backups

**Tech:** Postgres, Redis, auth layer, monitoring

**Why:** Make it usable by teams/companies

---

## 🐛 Known Technical Debt

**Response queue:**
- Currently in-memory (lost on restart)
- No TTL (old requests stay forever)
- Should migrate to Redis eventually

**Session persistence:**
- Just JSONL files right now
- Could use SQLite/Postgres for better querying

**YES/NO parsing:**
- Naive keyword matching
- Could use structured output from Claude

**Error handling:**
- No retry logic if bot crashes
- No cleanup of stale requests

**Auth:**
- No user authentication yet
- Anyone with bot token can use it

**Logs:**
- Append-only, no rotation
- Gets large over time

---

## 💡 Interesting Properties

**Information symmetry:**
- All bots can access entire codebase
- All bots can see all conversations
- Differentiated by personality/role, not access control
- Like a team with shared context but different expertise

**Observable by default:**
- Telegram (or future web UI) shows everything
- Human can jump in anytime
- Audit trail of all decisions
- Transparency over black box execution

**Incremental complexity:**
- Start simple (2 bots, YES/NO)
- Add features as needed (consensus, loops, workflows)
- No need to plan everything upfront

---

## 🎯 General Philosophy

- **Build iteratively:** Complete working phases, then recalibrate
- **Stay flexible:** Broad goals, not rigid plans
- **Prioritize visibility:** Always show what's happening
- **Keep context:** All bots share context by default
- **Human oversight:** Always possible to intervene

---

## 📊 Success Indicators (Loose)

**Short term:**
- Can delegate between bots reliably
- Multi-bot consensus works
- Useful for actual development tasks

**Medium term:**
- Standalone UI (not just Telegram)
- Others can deploy/use it
- Handles complex multi-step workflows

**Long term:**
- Community adoption
- Custom bots/plugins
- Production-ready for teams

---

## 🔄 Recalibration Points

**After each phase completes:**
- Review what worked / what didn't
- Update priorities based on usage
- Decide next immediate focus
- Keep long-term ideas in mind but don't commit

**Example:** Phase 2 just completed. Next immediate focus: probably Web UI OR start using it for real projects and see what's needed.

---

## 🗂️ Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture and current implementation
- [DELEGATION-SYSTEM.md](./DELEGATION-SYSTEM.md) - How delegation/callbacks work
