# Security Notes

This bot runs Claude CLI commands on your machine with file system access. It's designed as a personal tool, not a public service.

## Trust Model

**Bottom line:** Only add Telegram user IDs you trust to `ALLOWED_CHAT_IDS`.

The bot gives those users the same capabilities as if they were running `claude --ide` commands in your terminal.

## What Can the Bot Do?

Same capabilities as the Claude CLI with `--dangerously-skip-permissions`:

- **Read/write files** in `PROJECT_DIR`
- **Run bash commands** (if you ask Claude to)
- **Browser automation** via Playwright
- **Access project context** from the IDE

## Why `--dangerously-skip-permissions`?

The bot uses this flag because it can't handle interactive permission prompts via Telegram. Without it, the bot would hang waiting for manual approval in the IDE.

This is an architectural requirement, not a bug.

## Basic Security Measures

1. **Keep `TELEGRAM_TOKEN` secret** - Don't commit it to git (it's in `.gitignore`)
2. **Trust your users** - Only add user IDs to `ALLOWED_CHAT_IDS` if you trust them with terminal access
3. **Restrict `PROJECT_DIR`** - Point it to a specific project directory instead of `/` if you're paranoid
4. **Review logs** - Check `bot-output.log` occasionally to see what commands were run

## When NOT to Use This

- **Public bots** - This is for personal/trusted use only
- **Shared servers** - Don't run this on a machine with sensitive data from other users
- **Production environments** - This is a dev tool, not a production service

## Audit Trail

All Claude interactions are logged in:
- **`bot-output.log`** - Bot activity and responses
- **`~/.claude/projects/`** - Full Claude session history (`.jsonl` files)

You can review these anytime to see what commands were executed.

## Risk Comparison

Running this bot is roughly equivalent to:
- Giving someone SSH access to your machine
- Sharing your terminal via `tmux`
- Letting someone use your laptop

If you trust them with those, you can trust them with this bot.

## Reporting Issues

If you find a security issue, please open a GitHub issue. This is a personal project, not a security-critical service, so standard issue tracking is fine.
