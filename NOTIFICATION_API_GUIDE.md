# Notification Service API Guide

Complete guide for using the Multi-Channel Notification Service API. This guide provides practical examples using curl commands that can be used by AI systems or developers.

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Channel Management](#channel-management)
- [Sending Notifications](#sending-notifications)
- [Provider-Specific Examples](#provider-specific-examples)
- [Error Handling](#error-handling)

---

## Overview

The Notification Service provides a unified API for sending messages across multiple platforms:
- **Slack** - Team communication and notifications
- **WhatsApp** - Personal messaging via WhatsApp Web API
- **Telegram** - Bot-based messaging

**Base URL**: `http://localhost:3000/api` (adjust for production)

**Key Concepts**:
- **Channel**: A configured notification account (e.g., a WhatsApp number, Slack workspace)
- **Provider**: The platform type (slack, whatsapp, telegram)
- **Recipient**: The destination identifier (Slack channel ID, phone number, etc.)

---

## Authentication

The API supports two authentication methods:

### 1. JWT Token Authentication

Used for most API operations. Obtain a token by logging in:

```bash
# Login to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'
```

**Response**:
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "user-id",
    "email": "user@example.com",
    "role": "ADMIN"
  }
}
```

**Using the token** in subsequent requests:
```bash
curl -X GET http://localhost:3000/api/channels \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. API Key Authentication

Used for Socket.io connections and webhooks:

```bash
# Create an API key (requires JWT auth)
curl -X POST http://localhost:3000/api/api_keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App Integration"
  }'
```

---

## Channel Management

Channels must be created and configured before sending notifications.

### List All Channels

```bash
curl -X GET http://localhost:3000/api/channels \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response**:
```json
{
  "ok": true,
  "payload": [
    {
      "_id": "channel-mongo-id",
      "channelId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "slack",
      "name": "My Slack Workspace",
      "status": "active",
      "isActive": true,
      "config": {
        "botToken": "xoxb-...",
        "teamName": "My Team"
      }
    }
  ]
}
```

### Create a Channel

Channels are provider-specific. See [Provider-Specific Examples](#provider-specific-examples) for detailed setup.

### Get Channel Status

```bash
curl -X GET http://localhost:3000/api/channels/YOUR_CHANNEL_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Delete a Channel

```bash
curl -X DELETE http://localhost:3000/api/channels/YOUR_CHANNEL_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Sending Notifications

### Send Single Notification

The unified endpoint for sending notifications to any provider:

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "slack",
    "channelId": "550e8400-e29b-41d4-a716-446655440000",
    "recipient": "C09QDCWC8NL",
    "message": "Hello from the notification service!",
    "options": {}
  }'
```

**Request Parameters**:
- `provider` (required): Provider type - "slack", "whatsapp", or "telegram"
- `channelId` (required): Your channel's UUID
- `recipient` (required): Destination identifier (varies by provider)
- `message` (required): Message text content
- `options` (optional): Provider-specific options (see examples below)

**Response**:
```json
{
  "ok": true,
  "message": "Notification sent successfully",
  "payload": {
    "success": true,
    "provider": "slack",
    "messageId": "1234567890.123456",
    "data": {
      "ok": true,
      "channel": "C09QDCWC8NL",
      "ts": "1234567890.123456"
    }
  }
}
```

### Send Multi-Provider Notifications

Send the same or different messages to multiple providers simultaneously:

```bash
curl -X POST http://localhost:3000/api/notifications/send-multi \
  -H "Content-Type: application/json" \
  -d '{
    "notifications": [
      {
        "provider": "slack",
        "channelId": "slack-channel-uuid",
        "recipient": "C09QDCWC8NL",
        "message": "System alert: Deployment completed"
      },
      {
        "provider": "whatsapp",
        "channelId": "whatsapp-channel-uuid",
        "recipient": "1234567890@s.whatsapp.net",
        "message": "System alert: Deployment completed"
      }
    ]
  }'
```

**Response**:
```json
{
  "ok": true,
  "message": "Multi-provider notification sent",
  "payload": [
    {
      "provider": "slack",
      "recipient": "C09QDCWC8NL",
      "success": true,
      "data": {
        "success": true,
        "provider": "slack",
        "messageId": "1234567890.123456"
      },
      "error": null
    },
    {
      "provider": "whatsapp",
      "recipient": "1234567890@s.whatsapp.net",
      "success": true,
      "data": {
        "success": true,
        "provider": "whatsapp",
        "messageId": "message-id-here"
      },
      "error": null
    }
  ]
}
```

---

## Provider-Specific Examples

### Slack

#### Setup Slack Channel

```bash
curl -X POST http://localhost:3000/api/channels \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "550e8400-e29b-41d4-a716-446655440001",
    "type": "slack",
    "name": "My Slack Integration",
    "config": {
      "botToken": "xoxb-your-bot-token-here",
      "teamName": "My Team"
    },
    "status": "active",
    "isActive": true
  }'
```

**Getting Slack Bot Token**:
1. Go to https://api.slack.com/apps
2. Create a new app or select existing
3. Navigate to "OAuth & Permissions"
4. Add bot token scopes: `chat:write`, `chat:write.public`
5. Install app to workspace
6. Copy "Bot User OAuth Token"

#### Send Simple Slack Message

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "slack",
    "channelId": "550e8400-e29b-41d4-a716-446655440001",
    "recipient": "C09QDCWC8NL",
    "message": "Simple text message"
  }'
```

#### Send Formatted Slack Message with Blocks

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "slack",
    "channelId": "550e8400-e29b-41d4-a716-446655440001",
    "recipient": "C09QDCWC8NL",
    "message": "Fallback text for notifications",
    "options": {
      "blocks": [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": "Deployment Notification"
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*Status:* ✅ Success\n*Environment:* Production\n*Version:* v1.2.3"
          }
        },
        {
          "type": "divider"
        },
        {
          "type": "context",
          "elements": [
            {
              "type": "mrkdwn",
              "text": "Deployed by CI/CD Pipeline"
            }
          ]
        }
      ]
    }
  }'
```

#### Send Slack Message in Thread

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "slack",
    "channelId": "550e8400-e29b-41d4-a716-446655440001",
    "recipient": "C09QDCWC8NL",
    "message": "This is a reply in a thread",
    "options": {
      "thread_ts": "1234567890.123456"
    }
  }'
```

**Finding Slack Channel ID**:
```bash
# Right-click on channel in Slack > View channel details > Copy channel ID
# Or use the Slack API to list channels
```

---

### WhatsApp

#### Setup WhatsApp Channel

```bash
curl -X POST http://localhost:3000/api/whatsapp/channels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My WhatsApp Business",
    "phoneNumber": "1234567890"
  }'
```

**Response**:
```json
{
  "ok": true,
  "payload": {
    "channelId": "550e8400-e29b-41d4-a716-446655440002",
    "name": "My WhatsApp Business",
    "type": "whatsapp_automated",
    "status": "inactive",
    "phoneNumber": "1234567890"
  }
}
```

#### Connect WhatsApp Channel (QR Code Method)

```bash
# Step 1: Initiate connection
curl -X POST http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/connect \
  -H "Content-Type: application/json" \
  -d '{}'

# Step 2: Get QR code
curl -X GET http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/qr

# Step 3: Scan QR code with WhatsApp mobile app
# Step 4: Check status
curl -X GET http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/status
```

#### Connect WhatsApp Channel (Pairing Code Method)

```bash
# Request pairing code
curl -X POST http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/pairing-code \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "1234567890"
  }'

# Response includes pairing code to enter in WhatsApp mobile app
```

For real-time QR codes and connection updates, use Socket.io (see WHATSAPP_INTEGRATION.md).

#### Send WhatsApp Text Message

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "whatsapp",
    "channelId": "550e8400-e29b-41d4-a716-446655440002",
    "recipient": "1234567890@s.whatsapp.net",
    "message": "Hello from automated WhatsApp!"
  }'
```

**Recipient Format**:
- Individual: `1234567890@s.whatsapp.net`
- Group: `120363023456789012@g.us`
- LID (Linked Identity): `1234567890@lid` (automatically resolved)

#### Send WhatsApp Image

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "whatsapp",
    "channelId": "550e8400-e29b-41d4-a716-446655440002",
    "recipient": "1234567890@s.whatsapp.net",
    "message": "Check out this image!",
    "options": {
      "media": {
        "type": "image",
        "url": "https://example.com/image.jpg",
        "caption": "Beautiful sunset"
      }
    }
  }'
```

#### Send WhatsApp Document

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "whatsapp",
    "channelId": "550e8400-e29b-41d4-a716-446655440002",
    "recipient": "1234567890@s.whatsapp.net",
    "message": "Here is the report",
    "options": {
      "media": {
        "type": "document",
        "url": "https://example.com/report.pdf",
        "filename": "Monthly_Report.pdf",
        "caption": "Q4 2024 Report"
      }
    }
  }'
```

#### Check WhatsApp Contact Exists

```bash
curl -X GET "http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/contacts/1234567890@s.whatsapp.net/check"
```

#### Get WhatsApp Contact Profile Picture

```bash
curl -X GET "http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/contacts/1234567890@s.whatsapp.net/photo"
```

#### Disconnect WhatsApp Channel

```bash
curl -X POST http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/disconnect
```

---

### Telegram

#### Setup Telegram Channel

```bash
curl -X POST http://localhost:3000/api/channels \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "550e8400-e29b-41d4-a716-446655440003",
    "type": "telegram",
    "name": "My Telegram Bot",
    "config": {
      "botToken": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
      "botUsername": "my_bot"
    },
    "status": "active",
    "isActive": true
  }'
```

**Getting Telegram Bot Token**:
1. Message @BotFather on Telegram
2. Send `/newbot` command
3. Follow prompts to create bot
4. Copy the bot token provided

#### Send Telegram Message

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "telegram",
    "channelId": "550e8400-e29b-41d4-a716-446655440003",
    "recipient": "123456789",
    "message": "Hello from Telegram bot!"
  }'
```

**Recipient Format**:
- User chat ID: `123456789` (numeric)
- Channel: `@channel_username` or `-1001234567890`
- Group: `-1234567890`

**Finding Chat ID**:
1. Add bot to chat/channel
2. Send message to bot
3. Visit: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
4. Look for `chat.id` in response

---

## Error Handling

### Common Error Responses

#### Missing Required Field

```json
{
  "errors": {
    "msg": "PROVIDER_REQUIRED"
  }
}
```

#### Invalid Channel ID

```json
{
  "errors": {
    "msg": "Channel not found"
  }
}
```

#### Provider Error

```json
{
  "errors": {
    "msg": "Failed to send message: invalid_channel"
  }
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (channel/resource doesn't exist)
- `500` - Internal Server Error

### Multi-Provider Error Handling

When using `/api/notifications/send-multi`, individual provider failures don't stop other providers:

```json
{
  "ok": true,
  "message": "Multi-provider notification sent",
  "payload": [
    {
      "provider": "slack",
      "recipient": "C09QDCWC8NL",
      "success": true,
      "data": { ... },
      "error": null
    },
    {
      "provider": "whatsapp",
      "recipient": "invalid@s.whatsapp.net",
      "success": false,
      "data": null,
      "error": "Contact not found on WhatsApp"
    }
  ]
}
```

---

## Advanced Features

### Webhooks for Incoming Messages

Configure webhooks to receive incoming messages:

```bash
# Add webhook to WhatsApp channel
curl -X POST http://localhost:3000/api/whatsapp/channels/YOUR_CHANNEL_ID/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhook/whatsapp",
    "events": ["message.received", "message.delivered", "message.read"],
    "isActive": true
  }'
```

**Webhook Payload Example**:
```json
{
  "event": "message.received",
  "channelId": "550e8400-e29b-41d4-a716-446655440002",
  "timestamp": "2024-01-15T12:34:56.789Z",
  "data": {
    "messageId": "3EB0XXXXXXXXXXXX",
    "from": "1234567890@s.whatsapp.net",
    "message": "Hello!",
    "type": "text"
  }
}
```

### Pagination for Channel Lists

```bash
# Get channels with pagination
curl -X GET "http://localhost:3000/api/channels?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Filter Channels by Type

```bash
# Get only WhatsApp channels
curl -X GET "http://localhost:3000/api/channels?type=whatsapp_automated" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Complete Usage Example

Here's a complete workflow from authentication to sending notifications:

```bash
#!/bin/bash

# 1. Login and get JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | jq -r '.token')

echo "Token: $TOKEN"

# 2. Create Slack channel
SLACK_CHANNEL=$(curl -s -X POST http://localhost:3000/api/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "550e8400-e29b-41d4-a716-446655440001",
    "type": "slack",
    "name": "My Slack",
    "config": {"botToken": "xoxb-your-token"},
    "status": "active",
    "isActive": true
  }' | jq -r '.payload.channelId')

echo "Slack Channel ID: $SLACK_CHANNEL"

# 3. Send notification
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d "{
    \"provider\": \"slack\",
    \"channelId\": \"$SLACK_CHANNEL\",
    \"recipient\": \"C09QDCWC8NL\",
    \"message\": \"Hello from automation script!\"
  }"
```

---

## Testing Tips

### Using curl with Variables

```bash
# Set environment variables
export API_URL="http://localhost:3000/api"
export JWT_TOKEN="your-jwt-token-here"
export CHANNEL_ID="your-channel-id-here"

# Use in requests
curl -X POST $API_URL/notifications/send \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"provider\": \"slack\",
    \"channelId\": \"$CHANNEL_ID\",
    \"recipient\": \"C09QDCWC8NL\",
    \"message\": \"Test message\"
  }"
```

### Pretty Print JSON Responses

```bash
# Install jq: brew install jq (macOS) or apt-get install jq (Linux)

curl -X GET http://localhost:3000/api/channels \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
```

### Save Response to File

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{ ... }' \
  -o response.json

cat response.json | jq '.'
```

---

## Rate Limiting & Best Practices

1. **Rate Limits**: Be mindful of provider rate limits (Slack: ~1 msg/sec, WhatsApp: varies)
2. **Error Handling**: Always check response status and handle errors gracefully
3. **Retries**: Implement exponential backoff for failed requests
4. **Channel Management**: Keep channels active and monitor connection status
5. **Security**: Never expose JWT tokens or bot tokens in logs or version control

---

## Support & Documentation

- **API Architecture**: See `NOTIFICATION_ARCHITECTURE.md` for system design
- **WhatsApp Details**: See `WHATSAPP_INTEGRATION.md` for WhatsApp-specific features
- **General Setup**: See `CLAUDE.md` for development environment setup

For issues or questions, refer to the main project documentation.
