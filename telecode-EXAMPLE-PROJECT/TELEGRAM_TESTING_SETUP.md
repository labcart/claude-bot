# Telegram Testing Setup

This document explains how to set up programmatic Telegram testing so you can send messages and read responses from scripts (useful for AI assistant testing).

## What This Enables

- Send messages to your Telegram bot from command line
- Read message history from your bot
- Automate testing without manual phone interaction
- Fast iteration during development

---

## Prerequisites

1. Telegram API credentials (API ID and API Hash)
2. Your Telegram account phone number
3. Node.js installed

---

## Step 1: Get Telegram API Credentials

1. Go to https://my.telegram.org/auth
2. Log in with your phone number
3. Go to "API Development Tools"
4. Create an app (name doesn't matter)
5. Copy your:
   - **API ID** (numeric)
   - **API Hash** (hex string)

---

## Step 2: Install Dependencies

```bash
npm install telegram
```

---

## Step 3: Create Authentication Script

Create `telegram-auth.js`:

```javascript
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = parseInt(process.argv[2]);
const apiHash = process.argv[3];

if (!apiId || !apiHash) {
  console.error('Usage: node telegram-auth.js <API_ID> <API_HASH>');
  process.exit(1);
}

const stringSession = new StringSession('');

(async () => {
  console.log('Starting authentication...');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('Enter your phone number: '),
    password: async () => await input.text('Enter your password (if 2FA): '),
    phoneCode: async () => await input.text('Enter the code you received: '),
    onError: (err) => console.log(err),
  });

  console.log('✅ Successfully authenticated!');
  console.log('\nSave this session string to your .env file:');
  console.log('\nTELEGRAM_SESSION=' + client.session.save());
  
  process.exit(0);
})();
```

---

## Step 4: Authenticate

Run the authentication script:

```bash
node telegram-auth.js YOUR_API_ID YOUR_API_HASH
```

Follow the prompts:
1. Enter your phone number (with country code, e.g., +1234567890)
2. Enter the code Telegram sends you
3. Enter 2FA password (if enabled)

Copy the session string it outputs.

---

## Step 5: Add to .env

Add these to your `.env` file:

```
TELEGRAM_API_ID=YOUR_API_ID
TELEGRAM_API_HASH=YOUR_API_HASH
TELEGRAM_SESSION=THE_LONG_SESSION_STRING_FROM_AUTH
```

---

## Step 6: Create Send Script

Create `telegram-send.js`:

```javascript
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
require('dotenv').config();

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION;

if (!apiId || !apiHash || !sessionString) {
  console.error('❌ Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_SESSION in .env');
  process.exit(1);
}

const message = process.argv[2];
if (!message) {
  console.error('Usage: node telegram-send.js "your message here"');
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();

  // Get your bot's chat
  const dialogs = await client.getDialogs({ limit: 10 });
  const botChat = dialogs.find(d => d.title === 'Claude Relay'); // Change to your bot name

  if (!botChat) {
    console.error('❌ Could not find bot chat');
    process.exit(1);
  }

  await client.sendMessage(botChat.id, { message });
  console.log(`📤 Sending to Claude Relay: "${message}"`);
  console.log('✅ Message sent!');
  
  await client.disconnect();
  process.exit(0);
})();
```

---

## Step 7: Create Reader Script

Create `telegram-reader.js`:

```javascript
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
require('dotenv').config();

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION;

if (!apiId || !apiHash || !sessionString) {
  console.error('❌ Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_SESSION in .env');
  process.exit(1);
}

const limit = parseInt(process.argv[2]) || 50;

(async () => {
  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();

  const dialogs = await client.getDialogs({ limit: 10 });
  const botChat = dialogs.find(d => d.title === 'Claude Relay'); // Change to your bot name

  if (!botChat) {
    console.error('❌ Could not find bot chat');
    process.exit(1);
  }

  const messages = await client.getMessages(botChat.id, { limit });
  
  console.log(`\n📬 Reading messages from: ${botChat.title}`);
  console.log('=====================================\n');
  
  // Reverse to show oldest first
  messages.reverse();
  
  for (const msg of messages) {
    if (!msg.message) continue;
    
    const time = new Date(msg.date * 1000).toLocaleTimeString();
    const sender = msg.out ? 'You' : botChat.title;
    console.log(`[${time}] ${sender}: ${msg.message}`);
  }
  
  await client.disconnect();
  console.log('\n✅ Done\n');
  process.exit(0);
})();
```

---

## Step 8: Update .gitignore

Add to `.gitignore`:

```
telegram-session.json
.env
```

**IMPORTANT:** Never commit your session string or API credentials to git.

---

## Usage Examples

### Send a message to your bot:
```bash
node telegram-send.js "Hello bot!"
node telegram-send.js "/status"
node telegram-send.js "approve"
```

### Read recent messages:
```bash
node telegram-reader.js           # Last 50 messages
node telegram-reader.js 100       # Last 100 messages
node telegram-reader.js | tail -20  # Last 20 lines
```

### Common testing workflow:
```bash
# Send a test command
node telegram-send.js "Create a file test.txt"

# Wait a few seconds
sleep 5

# Check the response
node telegram-reader.js | tail -10
```

---

## Troubleshooting

### "API_ID_INVALID" error
- Double-check your API ID and Hash from https://my.telegram.org
- Make sure API_ID is a number (no quotes in .env)

### "Could not find bot chat"
- Change `'Claude Relay'` to your bot's actual chat name
- Check that you've messaged the bot at least once manually

### Session expired
- Delete TELEGRAM_SESSION from .env
- Run `telegram-auth.js` again to get a new session

### Connection timeout
- The scripts may take 5-10 seconds to connect (normal)
- Check your internet connection
- Telegram might be rate-limiting you (wait a minute)

---

## Security Notes

- ⚠️ **Session string = full account access** - Keep it secret
- ⚠️ Don't share your .env file or commit it to git
- ⚠️ Treat these credentials like passwords
- ✅ Use .gitignore to prevent accidental commits
- ✅ Session string works until you log out or revoke it in Telegram settings

---

## Copying to New Projects

1. Copy these 3 files:
   - `telegram-auth.js`
   - `telegram-send.js`
   - `telegram-reader.js`

2. Install dependency:
   ```bash
   npm install telegram
   ```

3. Add credentials to `.env`:
   ```
   TELEGRAM_API_ID=...
   TELEGRAM_API_HASH=...
   TELEGRAM_SESSION=...
   ```

4. Update bot name in send/reader scripts if different

5. You're ready to test!

