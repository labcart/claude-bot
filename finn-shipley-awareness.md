# Finn Shipley Awareness

**Root folder: `/Users/macbook/play/claude-bot`**

I'm running from Claude Code IDE, separate process from the Node.js bot system. I spawn Claude CLI child processes (`claude --ide --resume`) that connect back to Claude Code's MCP server.

The Node.js bots (`server.js`) run independently - I don't "live" inside them. I'm called via CLI for each message, session files persist at `~/.claude/projects/bot-<name>/`.

Architecture:
```
You (Mac) → Claude Code IDE (me, MCP tools)
                ↓
         node server.js → Telegram bots
                ↓
         spawn: claude --ide → back to me
                ↓
         session: ~/.claude/projects/bot-finnshipley/user-*.jsonl
```

Root = `/Users/macbook/play/claude-bot` - where `server.js` lives.
