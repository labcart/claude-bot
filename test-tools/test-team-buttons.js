/**
 * Test the /team button UI flow
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');

async function testTeamButtons() {
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
    console.error('❌ MattyAtlas bot not found.');
    await client.disconnect();
    process.exit(1);
  }

  console.log('🤖 Found bot: Matty Atlas\n');

  // Send some messages to build context
  console.log('📝 Sending context messages...');
  await client.sendMessage(mattyDialog.id, { message: 'Testing the button UI flow' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  await client.sendMessage(mattyDialog.id, { message: 'This should work with inline buttons' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  await client.sendMessage(mattyDialog.id, { message: 'Click the button to delegate' });
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Send /team command to trigger button menu
  console.log('\n📨 Sending /team command to show button menu...\n');
  await client.sendMessage(mattyDialog.id, { message: '/team' });

  console.log('✅ Sent! Now:');
  console.log('   1. Check Matty Atlas in Telegram');
  console.log('   2. You should see inline buttons (Send to FinnShipley, etc)');
  console.log('   3. Click "Send to FinnShipley" button');
  console.log('   4. Check FinnShipley chat for the delegated context');
  console.log('\n   Checking logs in 10 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 10000));

  await client.disconnect();
  process.exit(0);
}

testTeamButtons().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
