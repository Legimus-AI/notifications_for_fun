# WhatsApp Integration with Baileys

This document explains how to use the WhatsApp Baileys integration in the multi-channel notification system.

## Overview

The WhatsApp integration uses:

- **@whiskeysockets/baileys** for WhatsApp Web API
- **MongoDB** for authentication state persistence (production-ready)
- **Socket.io** for real-time QR codes, pairing codes, and connection status
- **Express REST API** for channel management and message sending

## Features

- ✅ Production-grade auth state persistence in MongoDB
- ✅ QR code generation and real-time delivery
- ✅ Pairing code support for headless authentication
- ✅ Automatic reconnection handling
- ✅ Real-time connection status updates
- ✅ Incoming message handling
- ✅ Message status tracking (sent, delivered, read)
- ✅ Graceful disconnection and cleanup

## API Endpoints

### 1. Create WhatsApp Channel

```http
POST /api/whatsapp/channels
Content-Type: application/json

{
  "name": "My WhatsApp Business",
  "phoneNumber": "1234567890"
}
```

**Response:**

```json
{
  "ok": true,
  "payload": {
    "channelId": "uuid-generated-id",
    "name": "My WhatsApp Business",
    "type": "whatsapp_automated",
    "status": "inactive",
    "phoneNumber": "1234567890"
  }
}
```

### 2. Connect Channel (Start WhatsApp Session)

```http
POST /api/whatsapp/channels/{channelId}/connect
Content-Type: application/json

{
  "phoneNumber": "1234567890"  // Optional, for pairing code
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Connection initiated",
  "channelId": "uuid-generated-id",
  "status": "connecting"
}
```

### 3. Get Channel Status

```http
GET /api/whatsapp/channels/{channelId}/status
```

**Response:**

```json
{
  "ok": true,
  "payload": {
    "channelId": "uuid-generated-id",
    "name": "My WhatsApp Business",
    "status": "active",
    "lastStatusUpdate": "2024-01-15T10:30:00Z",
    "isActive": true
  }
}
```

### 4. Send Text Message

```http
POST /api/whatsapp/channels/{channelId}/send
Content-Type: application/json

{
  "to": "1234567890@s.whatsapp.net",
  "message": "Hello from automated WhatsApp!",
  "type": "text"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Message sent",
  "payload": {
    "messageId": "whatsapp-message-id",
    "to": "1234567890@s.whatsapp.net",
    "type": "text",
    "status": "sent"
  }
}
```

### 5. Send Media Message

```http
POST /api/whatsapp/channels/{channelId}/send-media
Content-Type: application/json

{
  "to": "1234567890@s.whatsapp.net",
  "mediaType": "image",
  "mediaUrl": "https://example.com/image.jpg",
  "caption": "Check out this image!"
}
```

### 6. List All WhatsApp Channels

```http
GET /api/whatsapp/channels
```

### 7. Disconnect Channel

```http
POST /api/whatsapp/channels/{channelId}/disconnect
```

### 8. Request Pairing Code

```http
POST /api/whatsapp/channels/{channelId}/pairing-code
Content-Type: application/json

{
  "phoneNumber": "1234567890"
}
```

## Socket.io Real-time Events

### Client Connection

```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  path: '/socket.io/',
});

// Authenticate with your API key
socket.emit('authenticate', { apiKey: 'your-api-key' });

socket.on('authenticated', (data) => {
  console.log('✅ Authenticated:', data);
});
```

### Subscribe to Channel Events

```javascript
// Subscribe to a specific channel
socket.emit('subscribe_channel', { channelId: 'your-channel-id' });

// Listen for QR codes
socket.on('qr_code', (data) => {
  console.log('📱 QR Code received:', data);
  // data: { channelId, qrCode: "data:image/png;base64,...", timestamp }

  // Display QR code to user
  const img = document.getElementById('qr-code');
  img.src = data.qrCode;
});

// Listen for pairing codes
socket.on('pairing_code', (data) => {
  console.log('🔢 Pairing Code:', data);
  // data: { channelId, code: "ABCD1234", timestamp }

  // Show pairing code to user
  alert(`Pairing Code: ${data.code}`);
});

// Listen for connection status updates
socket.on('connection_update', (data) => {
  console.log('📊 Connection status:', data);
  // data: { channelId, status: "active", timestamp, lastDisconnect? }

  // Update UI based on status
  updateChannelStatus(data.channelId, data.status);
});

// Listen for incoming messages
socket.on('incoming_message', (data) => {
  console.log('💬 New message:', data);
  // data: { channelId, messageId, from, timestamp, message, type: "incoming" }
});

// Listen for message status updates
socket.on('message_status_update', (data) => {
  console.log('📨 Message status:', data);
  // data: { channelId, messageId, status: "delivered", timestamp }
});
```

## Channel Connection States

- **`inactive`** - Channel is created but not connected
- **`connecting`** - Attempting to connect to WhatsApp
- **`qr_ready`** - QR code is available for scanning
- **`pairing_code_ready`** - Pairing code is available
- **`active`** - Successfully connected and ready to send/receive
- **`error`** - Connection failed
- **`logged_out`** - User logged out from WhatsApp

## Message Status Codes & Webhook Events

Outbound messages emit a `message_status_update` Socket.io event AND fire a
typed webhook every time their delivery state advances. The status string
mirrors the WhatsApp Cloud API contract; the numeric code is the raw value
emitted by Baileys, which comes directly from `WAProto.WebMessageInfo.Status`
in the WhatsApp protobuf ([source](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc13/WAProto/WAProto.proto)).

| Baileys code | Proto enum | Webhook `status` | Webhook event name | UI meaning |
|---|---|---|---|---|
| 0 | `ERROR` | `failed` | `message.failed` | WhatsApp rejected the message (banned, invalid number, blocked) |
| 1 | `PENDING` | `pending` | `message.pending` | Queued locally, not yet acknowledged by WhatsApp server |
| 2 | `SERVER_ACK` | `sent` | `message.sent` | WhatsApp server accepted (single ✓) |
| 3 | `DELIVERY_ACK` | `delivered` | `message.delivered` | Reached recipient device (double ✓) |
| 4 | `READ` | `read` | `message.read` | Recipient opened the chat (blue ✓✓) |
| 5 | `PLAYED` | `played` | `message.played` | Voice/video note reproduced |
| _other_ | — | `unknown` | `message.status` | Forward-compatible fallback for any future code |

**Notes on actual observed behavior:**

- For recipients that are online when the message arrives, Baileys frequently
  skips `SERVER_ACK` (2) and emits `DELIVERY_ACK` (3) directly. This is a
  WhatsApp protocol behavior, not a bug ([Baileys #620](https://github.com/WhiskeySockets/Baileys/issues/620)).
- `failed` (code 0) typically appears for banned numbers, blocked recipients,
  or rate-limited sends. Build retry pipelines against `message.failed`, not
  the generic `message.status`.
- `played` (code 5) only fires for voice notes and round video notes once the
  recipient taps play. Plain video attachments and images do NOT emit it.

**Webhook payload shape** (matches WhatsApp Cloud API verbatim, so any
existing WA Cloud API consumer can be pointed at this service without
changes):

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "<channelId>",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "<phone>",
          "phone_number_id": "<jid>"
        },
        "statuses": [{
          "id": "<messageId>",
          "status": "delivered",
          "timestamp": 1763756400,
          "recipient_id": "<phone>"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

## Authentication Flow

### Option 1: QR Code Authentication

1. Create channel and connect
2. Listen for `qr_code` event via Socket.io
3. Display QR code to user
4. User scans with WhatsApp mobile app
5. Connection becomes `active`

### Option 2: Pairing Code Authentication

1. Create channel with phone number
2. Connect with phone number in request body
3. Listen for `pairing_code` event via Socket.io
4. Display pairing code to user
5. User enters code in WhatsApp mobile app
6. Connection becomes `active`

## Database Models

### WhatsApp Auth State

```javascript
// Stores main credentials
{
  channelId: "uuid",
  creds: { /* WhatsApp credentials */ },
  createdAt: Date,
  updatedAt: Date
}

// Stores encryption keys separately for performance
{
  channelId: "uuid",
  keyId: "session:1234567890",
  keyData: { /* Signal protocol keys */ },
  createdAt: Date,
  updatedAt: Date
}
```

### Channel Configuration

```javascript
{
  channelId: "uuid",
  type: "whatsapp_automated",
  config: {
    phoneNumber: "1234567890",
    qrCode: "data:image/png;base64,...",
    pairingCode: "ABCD1234"
  },
  status: "active",
  // ... other fields
}
```

## Production Considerations

1. **Security**: API keys should be validated properly
2. **Rate Limiting**: Implement rate limits for message sending
3. **Error Handling**: Monitor connection failures and implement retry logic
4. **Storage**: WhatsApp auth state is stored in MongoDB for persistence
5. **Scaling**: Each channel maintains its own connection
6. **Monitoring**: Log all connection events and message statistics

## Environment Variables

```env
# Frontend URL for Socket.io CORS
FRONTEND_DOMAIN=http://localhost:3000

# MongoDB connection (already configured)
MONGO_URI=mongodb://localhost:27017/your-database
```

## Example Frontend Integration

```html
<!doctype html>
<html>
  <head>
    <title>WhatsApp Channel Manager</title>
  </head>
  <body>
    <div id="app">
      <h1>WhatsApp Channel Manager</h1>

      <!-- QR Code Display -->
      <div id="qr-section" style="display:none;">
        <h3>Scan QR Code with WhatsApp</h3>
        <img id="qr-code" style="max-width: 300px;" />
      </div>

      <!-- Pairing Code Display -->
      <div id="pairing-section" style="display:none;">
        <h3>Enter Pairing Code in WhatsApp</h3>
        <h2 id="pairing-code"></h2>
      </div>

      <!-- Status Display -->
      <div>
        <h3>Status: <span id="status">Disconnected</span></h3>
        <button onclick="connectChannel()">Connect</button>
        <button onclick="disconnectChannel()">Disconnect</button>
      </div>

      <!-- Send Message -->
      <div>
        <h3>Send Message</h3>
        <input
          type="text"
          id="phone"
          placeholder="Phone number with @s.whatsapp.net"
        />
        <input type="text" id="message" placeholder="Message" />
        <button onclick="sendMessage()">Send</button>
      </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
      const socket = io();
      const channelId = 'your-channel-id'; // Get from your channel creation

      // Authenticate
      socket.emit('authenticate', { apiKey: 'your-api-key' });

      socket.on('authenticated', () => {
        console.log('Authenticated with Socket.io');
        socket.emit('subscribe_channel', { channelId });
      });

      // Handle events
      socket.on('qr_code', (data) => {
        document.getElementById('qr-code').src = data.qrCode;
        document.getElementById('qr-section').style.display = 'block';
        document.getElementById('pairing-section').style.display = 'none';
      });

      socket.on('pairing_code', (data) => {
        document.getElementById('pairing-code').textContent = data.code;
        document.getElementById('pairing-section').style.display = 'block';
        document.getElementById('qr-section').style.display = 'none';
      });

      socket.on('connection_update', (data) => {
        document.getElementById('status').textContent = data.status;
        if (data.status === 'active') {
          document.getElementById('qr-section').style.display = 'none';
          document.getElementById('pairing-section').style.display = 'none';
        }
      });

      async function connectChannel() {
        const response = await fetch(
          `/api/whatsapp/channels/${channelId}/connect`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        const result = await response.json();
        console.log('Connect result:', result);
      }

      async function sendMessage() {
        const phone = document.getElementById('phone').value;
        const message = document.getElementById('message').value;

        const response = await fetch(
          `/api/whatsapp/channels/${channelId}/send`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: phone, message, type: 'text' }),
          },
        );
        const result = await response.json();
        console.log('Send result:', result);
      }
    </script>
  </body>
</html>
```

## Troubleshooting

1. **Connection Issues**: Check MongoDB connection and WhatsApp service logs
2. **QR Code Not Appearing**: Ensure Socket.io connection is established
3. **Messages Not Sending**: Verify channel is in `active` status
4. **Disconnections**: Monitor logs for DisconnectReason and implement reconnection
5. **Auth State Issues**: Check MongoDB collections for proper key storage

This integration provides a complete, production-ready WhatsApp automation solution with real-time capabilities and persistent authentication state management.
