const axios = require('axios');

// Test script for Telegram Phones with Call Me Bot
async function testTelegramPhonesCall() {
  try {
    console.log('🚀 Testing Telegram Phones Call Me Bot functionality...');
    
    // First, let's create a test channel
    console.log('📝 Creating test Telegram Phones channel...');
    const createChannelResponse = await axios.post('http://localhost:4500/api/telegram-phones/channels', {
      name: 'Test Telegram Phones Channel',
      botToken: 'test-bot-token', // You'll need to replace with actual bot token
      callMeBotToken: 'test-callmebot-token', // You'll need to replace with actual CallMeBot token
      defaultPhoneCountry: '+51' // Peru country code for your number
    });
    
    if (createChannelResponse.data.ok) {
      const channelId = createChannelResponse.data.payload.channelId;
      console.log(`✅ Channel created with ID: ${channelId}`);
      
      // Now let's test the phone call functionality
      console.log('📞 Initiating phone call to 51983724476...');
      const callResponse = await axios.post(`http://localhost:4500/api/telegram-phones/${channelId}/call`, {
        phone: '51983724476',
        message: 'This is a test call from the Telegram Phones notification system!',
        language: 'es-PE' // Spanish for Peru
      });
      
      console.log('📞 Call Response:', callResponse.data);
      
      // Test sending a message with call request button
      console.log('💬 Sending message with call request button...');
      const messageResponse = await axios.post(`http://localhost:4500/api/telegram-phones/${channelId}/send-call-request`, {
        chat_id: 'your-chat-id', // You'll need to replace with actual chat ID
        message: '📞 Click below to call me!',
        phone_number: '51983724476'
      });
      
      console.log('💬 Message Response:', messageResponse.data);
      
    } else {
      console.error('❌ Failed to create channel:', createChannelResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error.response?.data || error.message);
  }
}

// Alternative: Direct CallMeBot API test (without our service)
async function testDirectCallMeBot() {
  try {
    console.log('🚀 Testing direct CallMeBot API...');
    
    // You need to get your API key from https://www.callmebot.com
    const apiKey = 'your-callmebot-api-key'; // Replace with your actual API key
    const phoneNumber = '+51983724476'; // Your phone number with country code
    
    const response = await axios.get(`https://api.callmebot.com/start.php?phone=${phoneNumber}&apikey=${apiKey}&text=This+is+a+test+call+from+Telegram+Phones+system`);
    
    console.log('📞 Direct CallMeBot Response:', response.data);
    
  } catch (error) {
    console.error('❌ Error during direct CallMeBot test:', error.response?.data || error.message);
  }
}

// Run the tests
console.log('🧪 Starting Telegram Phones tests...');
console.log('⚠️  Note: You need to replace the placeholder tokens with actual values');
console.log('');

// testTelegramPhonesCall();
testDirectCallMeBot();
