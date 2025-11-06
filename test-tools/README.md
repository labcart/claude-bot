# Test Tools

This directory contains tools for testing Telegram bots from the command line without needing to manually use the Telegram app.

## What's Here

- **telegram-session.json** - Authenticated Telegram session (already logged in as you)
- **telegram-send.js** - Script to send messages to bots programmatically

## Why This Exists

When debugging bots, constantly switching to Telegram on your phone/desktop is slow. These tools let you:

1. **Send messages from terminal** - Type commands, no app switching
2. **Automate testing** - Run 100 test messages in a loop
3. **Debug faster** - See logs in real-time next to bot output
4. **Script test scenarios** - Test specific conversation flows

## How It Works

The `telegram-session.json` contains an authenticated Telegram session (you already logged in once). The send script uses this session to act as YOU sending messages to bots.

**Think of it like**: You're texting yourself, but programmatically.

## Usage

### Send a test message

```bash
node test-tools/telegram-send.js "Hey what's up?"
```

This will:
1. Connect using your authenticated session
2. Find the bot (MattyAtlas by default)
3. Send the message
4. Disconnect

### Watch the bot respond

In another terminal, watch the bot server logs:

```bash
# Terminal 1: Run bot server
npm start

# Terminal 2: Send test messages
node test-tools/telegram-send.js "test message 1"
node test-tools/telegram-send.js "test message 2"
```

You'll see the logs in Terminal 1 showing the bot processing your messages.

### Change which bot to message

Edit `telegram-send.js` line 21:

```javascript
// Change "MattyAtlas" to your bot's name
const botDialog = dialogs.find(d => (d.title || d.name || '').includes('YourBotName'));
```

## Example Testing Workflow

```bash
# Start bot server
npm start

# In another terminal, rapid-fire test different scenarios:
node test-tools/telegram-send.js "/start"
node test-tools/telegram-send.js "What's your favorite food?"
node test-tools/telegram-send.js "Tell me a joke"
node test-tools/telegram-send.js "/reset"
node test-tools/telegram-send.js "Do you remember our conversation?"
```

Watch the bot server logs to see responses in real-time.

## Advanced: Automated Testing

You can script entire conversations:

```bash
#!/bin/bash
# test-conversation.sh

echo "Testing bot personality..."

node test-tools/telegram-send.js "Hey"
sleep 3

node test-tools/telegram-send.js "What's 2+2?"
sleep 3

node test-tools/telegram-send.js "Tell me about yourself"
sleep 3

echo "Test complete!"
```

## Troubleshooting

### "Bot not found"

The script searches your recent Telegram dialogs for the bot name. If not found:

1. Message the bot manually once from Telegram
2. Check the error output - it shows available dialogs
3. Update the search term in `telegram-send.js` to match your bot's exact name

### "Session expired"

If the session expires (rare), you'd need to re-authenticate. But this session typically lasts months/years.

### Dependencies

The script uses `telegram` package (GramJS). If not installed:

```bash
cd test-tools
npm install telegram
```

(But it should already be installed from telecode setup)

## Security Note

**Keep `telegram-session.json` private!** Anyone with this file can send messages as you on Telegram.

- ✅ It's in `.gitignore` already
- ✅ Don't share it
- ✅ Don't commit it to git

## For Future Claude Sessions

**To the next LLM reading this**: This setup lets you test bots by running:

```bash
node test-tools/telegram-send.js "your test message"
```

You don't need to ask the user to manually test via Telegram app. Just run the script and watch the bot server logs for the response. The session is already authenticated.

---

**Summary**: Command-line Telegram messaging for bot testing. No manual app interaction needed.
