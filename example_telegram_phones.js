const axios = require('axios');

// Example: Using Telegram Phones with Call Me Bot
async function demonstrateTelegramPhones() {
  const BASE_URL = 'http://localhost:4500';
  
  try {
    console.log('🚀 Telegram Phones with Call Me Bot - Example Demo');
    console.log('==================================================');
    
    // Step 1: Create a Telegram Phones channel
    console.log('\n📝 Step 1: Creating Telegram Phones channel...');
    const createChannelResponse = await axios.post(`${BASE_URL}/api/telegram-phones/channels`, {
      name: 'ViktorJJF Telegram Phones Channel',
      botToken: 'your-telegram-bot-token', // Replace with actual bot token
      callMeBotToken: 'free', // Using free tier (no API key needed)
      defaultPhoneCountry: '+51' // Peru
    });
    
    if (createChannelResponse.data.ok) {
      const channelId = createChannelResponse.data.payload.channelId;
      console.log(`✅ Channel created successfully! ID: ${channelId}`);
      
      // Step 2: Test direct phone call to @ViktorJJF
      console.log('\n📞 Step 2: Initiating phone call to @ViktorJJF...');
      const callResponse = await axios.post(`${BASE_URL}/api/telegram-phones/${channelId}/call`, {
        phone: '@ViktorJJF', // Your Telegram username
        message: 'Hello Viktor! This is a test call from your Telegram Phones notification system.',
        language: 'es-ES' // Spanish voice
      });
      
      console.log('📞 Call Response:', JSON.stringify(callResponse.data, null, 2));
      
      // Step 3: Test with phone number (alternative)
      console.log('\n📱 Step 3: Testing with phone number...');
      const phoneCallResponse = await axios.post(`${BASE_URL}/api/telegram-phones/${channelId}/call`, {
        phone: '51983724476', // Your phone number without country code
        message: 'This is a test call using your phone number.',
        language: 'es-PE' // Peruvian Spanish
      });
      
      console.log('📱 Phone Call Response:', JSON.stringify(phoneCallResponse.data, null, 2));
      
      // Step 4: Send a message with call request button (requires Telegram chat ID)
      console.log('\n💬 Step 4: Example of sending message with call button...');
      console.log('⚠️  Note: This requires your Telegram chat ID with the bot');
      
      // Step 5: Test using unified notification system
      console.log('\n🔔 Step 5: Testing through unified notification system...');
      const unifiedResponse = await axios.post(`${BASE_URL}/api/notifications/send`, {
        provider: 'telegram_phones',
        channelId: channelId,
        recipient: '@ViktorJJF', // This would normally be a chat ID, but we're using it for the call demo
        message: 'Test message from unified system',
        options: {
          initiate_call: true,
          phone_number: '@ViktorJJF',
          call_message: 'This call was initiated through the unified notification system!',
          call_language: 'es-ES'
        }
      });
      
      console.log('🔔 Unified System Response:', JSON.stringify(unifiedResponse.data, null, 2));
      
      // Step 6: List all channels
      console.log('\n📋 Step 6: Listing all Telegram Phones channels...');
      const listResponse = await axios.get(`${BASE_URL}/api/telegram-phones/channels`);
      console.log('📋 Channels:', JSON.stringify(listResponse.data, null, 2));
      
    } else {
      console.error('❌ Failed to create channel:', createChannelResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Error during demonstration:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure your server is running on http://localhost:4500');
      console.log('   Run: npm start or npm run dev');
    }
  }
}

// Direct CallMeBot API test (for comparison)
async function directCallMeBotTest() {
  console.log('\n🔧 Direct CallMeBot API Test (for comparison)');
  console.log('================================================');
  
  try {
    // Test with your username
    console.log('📞 Calling @ViktorJJF directly...');
    const response = await axios.get('https://api.callmebot.com/start.php', {
      params: {
        user: '@ViktorJJF',
        text: 'Direct API test call from Viktor\'s notification system',
        lang: 'es-ES',
        rpt: 2 // Repeat message twice
      }
    });
    
    console.log('📞 Direct API Response:', response.data);
    
  } catch (error) {
    console.error('❌ Direct API test failed:', error.message);
  }
}

// Run the demonstrations
console.log('🧪 Starting Telegram Phones Examples...\n');

// Check if server is running first
axios.get('http://localhost:4500/health')
  .then(() => {
    demonstrateTelegramPhones();
  })
  .catch(() => {
    console.log('⚠️  Server not running. Skipping service demo, testing direct API only...\n');
    directCallMeBotTest();
  });

// Always run direct API test
setTimeout(() => {
  directCallMeBotTest();
}, 2000);
