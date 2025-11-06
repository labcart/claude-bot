Hey, I want to build a Telegram bot that uses Claude AI (regular chat, not Claude Code) as the backend — but without using Anthropic’s official API keys.

Here’s what I’m going for:

I already have a Claude subscription (Pro/Max), and I want to leverage that session to relay messages through a bot.

I’ve done something similar with Claude Code: I used the CLI and streamed JSON output into Telegram. Now I want to do the same but for regular Claude chat.

The idea is to use tools like CCProxy, Clove, or similar that can:

Log in via OAuth or browser session

Reuse my Claude subscription session to make requests

Provide a local endpoint (e.g., /v1/messages) that the Telegram bot can hit

Stream responses back into Telegram

⚠️ Important: We’re not using official API tokens — we want to simulate the web client or CLI access using the subscription I already pay for.

If needed, we can run a local proxy or reverse-engineered bridge to Claude’s backend. Also open to using the Claude CLI (headless, stream mode) with model override if it helps — but ideally we get something closer to regular Claude chat behavior, not the coding agent.