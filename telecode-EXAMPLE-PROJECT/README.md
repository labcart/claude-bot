# Claude Telegram Relay Bot

Access your Claude CLI sessions remotely via Telegram. Send messages from your phone and get responses back from Claude with full conversation context.

## ⚠️ Security Note

This bot runs Claude CLI with file system access. **Only add trusted users to `ALLOWED_CHAT_IDS`** - they get the same access as running `claude --ide` in your terminal.

See [SECURITY.md](SECURITY.md) for details.

## Features

- Access Claude sessions from anywhere via Telegram
- **Switch between ALL your Claude projects** - select any project on the fly
- Browse and connect to sessions from any project
- Full conversation history maintained
- Multiple messages queued automatically by Claude CLI
- Session previews show titles, timestamps, and last message

## Requirements

- Node.js 14+
- Claude CLI installed (`claude` command available)
- Claude Code IDE running (for `--ide` flag)
- Telegram bot token from [@BotFather](https://t.me/botfather)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure `.env`:**
   ```bash
   TELEGRAM_TOKEN=your_bot_token_from_botfather
   ALLOWED_CHAT_IDS=your_telegram_chat_id
   CLAUDE_CMD=claude
   ALLOW_FIRST_CHAT=1
   ```

4. **Get your Chat ID:**
   - Run the bot: `node bridge.js`
   - Message your bot
   - Check logs for: `⛔ Unauthorized chat: 123456789`
   - Add that number to `ALLOWED_CHAT_IDS`

5. **Run:**
```bash
   node bridge.js
   ```

## Usage

**Connect to a session:**
```
You: /resume
Bot: [List of ALL your Claude projects]
You: 2
Bot: [List of 10 recent sessions from that project]
You: 1
Bot: ✅ Connected to session
```

**Send messages:**
```
You: What files are in this project?
Bot: [Claude's response]
```

**Switch projects:**
```
You: /leave
Bot: 👋 Disconnected
You: /resume
Bot: [Pick a different project and session]
```

## Commands

- `/start` or `/help` - Show help
- `/resume` - Select project and session to connect
- `/leave` - Disconnect from current session
- `/status` - Check current project and session

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_TOKEN` | Yes | - | Bot token from BotFather |
| `ALLOWED_CHAT_IDS` | Yes | - | Comma-separated user IDs |
| `CLAUDE_CMD` | No | `claude` | Claude CLI command |
| `ALLOW_FIRST_CHAT` | No | `0` | Auto-allow first user (0 or 1) |

## How It Works

Each message runs from the target project's directory:
```bash
cd /path/to/selected/project
echo "your message" | claude --ide --resume <session-id> --dangerously-skip-permissions
```

**The Key: Working Directory**
- Claude CLI uses the current working directory (`cwd`) to determine which project's sessions to access
- Bot sets `cwd` dynamically based on your project selection
- This allows accessing any project without manual IDE switching

**Command Flags:**
- `--ide` connects to running Claude Code IDE
- `--resume` loads existing session with context
- `--dangerously-skip-permissions` bypasses file operation prompts (required for non-interactive use)

Claude CLI handles queuing, file locking, and state management.

Projects and sessions are stored in `~/.claude/projects/<project>/<session-id>.jsonl`

## Limitations

- **2-minute timeout** per message
- **4096 character limit** (Telegram limitation)
- **No file uploads** from Telegram
- **No image support** 
- **Only one bot instance** per bot token (Telegram API limitation)
- **One active session at a time** per user (but can switch between projects instantly)

## Troubleshooting

**Bot not responding:**
- Check if running: `ps aux | grep "node bridge.js"`
- Verify `TELEGRAM_TOKEN` and `ALLOWED_CHAT_IDS` in `.env`
- Check logs if using `| tee bot-output.log`

**"No conversation found":**
- Ensure Claude Code IDE is running
- Test manually: `claude --ide` should work
- Check `~/.claude/projects/` has session files

**Timeout after 2 minutes:**
- Message took longer than timeout allows
- Adjust timeout in `bridge.js` line 96: `timeout: 120000`

**Multiple instances conflict (409 errors):**
- Only run one `node bridge.js` at a time
- Kill existing: `pkill -f "node bridge.js"`

## Technical Details

**Stack:**
- Node.js + `node-telegram-bot-api`
- `child_process.exec()` to run Claude CLI
- Reads session metadata from `~/.claude/projects/`

**Per-chat state:**
```javascript
{
  state: 'idle' | 'selecting_project' | 'listing' | 'connected',
  selectedProject: 'encoded-project-name',
  selectedProjectPath: '/real/filesystem/path',
  sessionId: 'uuid',
  projectList: [...],
  sessionList: [...]
}
```

**Message flow:**
1. Bot scans `~/.claude/projects/` for ALL projects
2. User selects a project
3. Bot shows 10 most recent sessions from that project
4. User selects a session
5. Telegram message → Bot
6. Bot runs `claude --ide --resume <id>` with `cwd` set to selected project path
7. Claude CLI processes using that working directory (queues if needed)
8. Response captured from stdout
9. Sent back to Telegram (chunked if > 4000 chars)

## License

MIT


