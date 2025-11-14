# 📞 Telegram Phones with Call Me Bot - Complete Guide

## 🎯 Overview
The Telegram Phones channel allows you to send Telegram messages and initiate voice calls using the CallMeBot service. This is perfect for sending urgent notifications that require immediate attention.

## 🚀 Quick Start

### 1. Create a Telegram Phones Channel
```bash
curl -X POST http://localhost:4500/api/telegram-phones/channels \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Telegram Phones Bot",
    "botToken": "your-telegram-bot-token",
    "callMeBotToken": "free",
    "defaultPhoneCountry": "+51"
  }'
```

### 2. Authorize CallMeBot (Required!)
Before receiving calls, you must authorize CallMeBot:
- Send `/start` to [@CallMeBot_txtbot](https://t.me/CallMeBot_txtbot) in Telegram
- Or visit: https://www.callmebot.com/telegram-voice-call-api/

### 3. Make a Phone Call
```bash
curl -X POST http://localhost:4500/api/telegram-phones/{channelId}/call \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "@ViktorJJF",
    "message": "Hello! This is an important notification.",
    "language": "es-ES"
  }'
```

## 📋 API Endpoints

### Channel Management
- `POST /api/telegram-phones/channels` - Create channel
- `GET /api/telegram-phones/channels` - List channels
- `GET /api/telegram-phones/channels/:id` - Get channel details
- `PUT /api/telegram-phones/channels/:id` - Update channel
- `DELETE /api/telegram-phones/channels/:id` - Delete channel

### Messaging & Calls
- `POST /api/telegram-phones/:channelId/send` - Send Telegram message
- `POST /api/telegram-phones/:channelId/call` - Initiate phone call
- `POST /api/telegram-phones/:channelId/call-request` - Send message with call button

## 🔧 Usage Examples

### Example 1: Direct Phone Call
```bash
# Call using Telegram username
curl -X POST http://localhost:4500/api/telegram-phones/{channelId}/call \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "@ViktorJJF",
    "message": "Urgent: Server maintenance in 10 minutes",
    "language": "es-ES"
  }'

# Call using phone number
curl -X POST http://localhost:4500/api/telegram-phones/{channelId}/call \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "51983724476",
    "message": "Emergency alert detected",
    "language": "es-PE"
  }'
```

### Example 2: Send Message with Call Button
```bash
curl -X POST http://localhost:4500/api/telegram-phones/{channelId}/call-request \
  -H 'Content-Type: application/json' \
  -d '{
    "chat_id": "123456789",
    "message": "🚨 Alert: Click below to receive immediate call",
    "phone_number": "@ViktorJJF"
  }'
```

### Example 3: Through Unified Notification System
```bash
curl -X POST http://localhost:4500/api/notifications/send \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "telegram_phones",
    "channelId": "your-channel-id",
    "recipient": "chat-id-or-username",
    "message": "Critical system alert!",
    "options": {
      "initiate_call": true,
      "phone_number": "@ViktorJJF",
      "call_message": "System emergency - immediate attention required",
      "call_language": "es-ES"
    }
  }'
```

## 🌍 Available Languages

CallMeBot supports multiple languages for text-to-speech:
- `en-US` - English (US)
- `en-GB` - English (UK)
- `es-ES` - Spanish (Spain)
- `es-PE` - Spanish (Peru)
- `fr-FR` - French
- `de-DE` - German
- `it-IT` - Italian
- `pt-BR` - Portuguese (Brazil)
- And many more...

## ⚠️ Important Notes

### Rate Limits
- **Free tier**: 65 seconds between calls to the same user
- **Dedicated bot**: No limits ($15/month)
- This prevents system overload and spam

### Call Quality
- Calls work best on Android/Telegram Desktop
- iOS has known audio playback issues in Telegram app
- Call duration: ~30 seconds on free tier

### Phone Number Formats
```bash
# Telegram username (recommended)
"@ViktorJJF"

# Phone number with country code
"+51983724476"

# Phone number without country code (uses default)
"51983724476"
```

## 🛠️ Configuration Options

### Channel Configuration
```json
{
  "name": "Channel Name",
  "botToken": "telegram-bot-token",
  "callMeBotToken": "free", // or dedicated bot API key
  "defaultPhoneCountry": "+51" // Default country code
}
```

### Call Parameters
```json
{
  "phone": "@username or phone_number",
  "message": "Text to speak (max 256 chars)",
  "language": "es-ES", // Optional: voice language
  "rpt": 2 // Optional: repeat count (1-3)
}
```

## 📱 Testing Your Setup

### 1. Test Direct API
```bash
curl -X GET "https://api.callmebot.com/start.php?user=@ViktorJJF&text=Test+message&lang=es-ES"
```

### 2. Test Through Service
```bash
# Start your server first
npm start

# Then run the example
node example_telegram_phones.js
```

## 🔍 Troubleshooting

### Common Issues
1. **"User not in whitelist"** - Send `/start` to @CallMeBot_txtbot
2. **"Two calls within 65 seconds"** - Wait for rate limit to reset
3. **"Missed Call"** - User didn't answer, try again when available
4. **Server not running** - Start with `npm start` or `npm run dev`

### Debug Mode
Enable debug logging by setting:
```bash
export DEBUG=telegram_phones
npm start
```

## 📞 Upgrade to Dedicated Bot

For production use, consider upgrading to a dedicated bot:
- ✅ No rate limits
- ✅ Longer calls (30+ seconds)
- ✅ Custom bot appearance
- ✅ Priority queue
- 💰 $15/month (annual billing)

Contact: [email protected]

## 🎯 Best Practices

1. **Use usernames** instead of phone numbers when possible
2. **Keep messages short** (under 256 characters)
3. **Choose appropriate language** for your audience
4. **Respect rate limits** on free tier
5. **Test thoroughly** before production deployment
6. **Handle missed calls** gracefully in your application

## 📚 Additional Resources

- [CallMeBot Documentation](https://www.callmebot.com/telegram-call-api/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Available Languages](https://cloud.google.com/text-to-speech/docs/voices)

---

**🎉 Congratulations!** You now have a fully functional Telegram Phones notification system with Call Me Bot integration.
