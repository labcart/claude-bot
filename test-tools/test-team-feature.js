/**
 * Test the /team command feature
 * Sends messages to MattyAtlas, then delegates context to FinnShipley
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');

async function testTeamFeature() {
  const sessionPath = path.join(__dirname, 'telegram-session.json');
  const savedSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const session = new StringSession(savedSession.session);

  const client = new TelegramClient(session, savedSession.api_id, savedSession.api_hash, {
    connectionRetries: 5,
  });

  await client.connect();

  // Find MattyAtlas bot
  const dialogs = await client.getDialogs({ limit: 50 });
  const mattyDialog = dialogs.find(d => (d.title || d.name || '').includes('Matty Atlas'));

  if (!mattyDialog) {
    console.error('❌ MattyAtlas bot not found. Available dialogs:');
    dialogs.slice(0, 10).forEach(d => console.log(`   - ${d.title || d.name}`));
    await client.disconnect();
    process.exit(1);
  }

  console.log(`🤖 Found bot: ${mattyDialog.title}`);
  console.log('\n📝 Sending test conversation to build context...\n');

  // Send a series of messages to build context
  const messages = [
    'Hey MattyAtlas, I need to test the new team feature',
    'I\'m working on a cross-bot delegation system',
    'It allows bots to share context with each other',
    'The feature sends the last 15 messages as context',
    'We need to make sure it filters out security wrappers',
    'Can you acknowledge you received these test messages?'
  ];

  for (const msg of messages) {
    console.log(`📤 Sending: "${msg}"`);
    await client.sendMessage(mattyDialog.id, { message: msg });
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between messages
  }

  console.log('\n⏳ Waiting 5 seconds for bot responses...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Now test the /team command
  console.log('📨 Testing /team command to delegate to FinnShipley...\n');
  await client.sendMessage(mattyDialog.id, { message: '/team @finnshipley please review this test conversation' });

  console.log('✅ Test messages sent!');
  console.log('\n📊 Summary:');
  console.log('   - Sent 6 context messages to MattyAtlas');
  console.log('   - Sent /team command to delegate to FinnShipley');
  console.log('\n🔍 Next steps:');
  console.log('   1. Check /tmp/bot-server.log for delegation logs');
  console.log('   2. Check FinnShipley conversation for received context');
  console.log('   3. Verify 15 messages were sent (or all available if less)');

  await client.disconnect();
  process.exit(0);
}

testTeamFeature().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
