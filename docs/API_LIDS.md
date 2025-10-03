# API - LIDs (Link IDs)

WhatsApp uses Linked IDs (LID) to hide user phone numbers in public groups and other contexts for privacy.

The following endpoints allow you to map between a LID (`@lid`) and a phone number (`@s.whatsapp.net` or `@c.us`).

## Endpoints

### Get All Known LIDs

Query all known LID-to-phone number mappings for a channel.

```http
GET /api/whatsapp/channels/{channelId}/lids?limit=100&offset=0
```

**Query Parameters:**
- `limit` (optional, default: 100) - Number of records to return
- `offset` (optional, default: 0) - Pagination offset

**Response:**
```json
[
  {
    "lid": "123123123@lid",
    "pn": "123456789@s.whatsapp.net"
  },
  {
    "lid": "456456456@lid",
    "pn": "987654321@s.whatsapp.net"
  }
]
```

**Note:** Call this after receiving messages from groups to populate the LID to phone number mapping.

---

### Get Count of LIDs

Returns the number of known LID mappings for a channel.

```http
GET /api/whatsapp/channels/{channelId}/lids/count
```

**Response:**
```json
{
  "count": 123
}
```

---

### Get Phone Number by LID

Retrieve the associated phone number for a specific LID.

```http
GET /api/whatsapp/channels/{channelId}/lids/{lid}
```

**Path Parameters:**
- `{channelId}` - Channel ID
- `{lid}` - LID to lookup (can be `123123@lid` or just `123123`)

**Examples:**
```bash
# With full LID format (remember to URL encode @)
GET /api/whatsapp/channels/my-channel/lids/123123123%40lid

# With just the number (recommended)
GET /api/whatsapp/channels/my-channel/lids/123123123
```

**Response (Found):**
```json
{
  "lid": "123123123@lid",
  "pn": "123456789@s.whatsapp.net"
}
```

**Response (Not Found):**
```json
{
  "error": "LID_NOT_FOUND",
  "message": "No phone number found for LID: 123123123"
}
```

---

### Get LID by Phone Number

Fetch the LID for a given phone number.

```http
GET /api/whatsapp/channels/{channelId}/lids/pn/{phoneNumber}
```

**Path Parameters:**
- `{channelId}` - Channel ID
- `{phoneNumber}` - Phone number to lookup (can be `123123@s.whatsapp.net`, `123123@c.us`, or just `123123`)

**Examples:**
```bash
# With full phone number format (remember to URL encode @)
GET /api/whatsapp/channels/my-channel/lids/pn/123456789%40s.whatsapp.net

# With just the number (recommended)
GET /api/whatsapp/channels/my-channel/lids/pn/123456789
```

**Response (Found):**
```json
{
  "lid": "123123123@lid",
  "pn": "123456789@s.whatsapp.net"
}
```

**Response (Not Found):**
```json
{
  "error": "PHONE_NUMBER_NOT_FOUND",
  "message": "No LID found for phone number: 123456789"
}
```

---

## Understanding LIDs

### What is a LID?

LID stands for **Link ID** — a new participant identifier format introduced by WhatsApp in 2025 for privacy.

Traditionally, participants were identified by their phone number:
- User ID: `123456789@s.whatsapp.net`

With the new privacy model, WhatsApp uses an anonymous identifier:
- Participant ID: `123123123@lid` (no phone number visible)

### Key Points

1. **Unique to User**: The LID is unique to each user account (not per group)
2. **Same LID Everywhere**: For the same phone number, the same LID will always be used across all chats and groups
3. **Privacy Feature**: Used when group admins enable "Hide phone numbers" or in Communities with stricter privacy settings
4. **Not Reversible**: You cannot derive the phone number from a LID without the mapping

### When You'll See LIDs

- **Private Groups**: When "Hide phone numbers" is enabled
- **Communities**: Groups within communities often use LIDs
- **Large Groups**: WhatsApp shows masked values like `+43.......21` instead of full numbers

### How to Handle LIDs in Your Application

#### Incoming Messages

When you receive a message from a user with LID privacy enabled, the webhook will include:

```json
{
  "from": "200850521731320",
  "id": "3A8D70A7741631BC0E51",
  "timestamp": 1759502141,
  "isLid": true,  // ← Indicates this was a LID message
  "type": "text",
  "text": {
    "body": "Hello!"
  }
}
```

#### Database Tracking

All messages are stored in the `WhatsAppEvents` collection with:
- `isLid`: `true` if the message came from a LID
- `isUnresolvedLid`: `true` if we couldn't map the LID to a phone number

#### Replying to LID Users

You can still reply to users even if you only have their LID. The system will handle the routing internally.

---

## FAQ

### Why can't I find a phone number for a LID?

Possible reasons:
1. You don't have the phone number in your contact list
2. You're not an admin in the group where this LID appeared
3. The LID mapping hasn't been synced from WhatsApp servers yet
4. The user has strict privacy settings that prevent mapping

### How do I populate the LID mappings?

The mappings are automatically populated when:
1. You receive messages from users with LIDs
2. You're an admin in groups with LID-enabled users
3. The WhatsApp server sends LID mapping updates

### Can I convert a LID back to a phone number?

Only if:
- You have the mapping in your database (check with the API)
- You're an admin in a group where the user is a member
- The user has shared their contact with you

---

## Migration from Phone Numbers

WhatsApp is transitioning toward:
- Username support (`@username` like Telegram)
- Full anonymity in public groups
- LID as the primary identifier

**Recommendation**: Design your application to work with both phone numbers and LIDs. Don't rely solely on phone numbers for user identification.

---

## Example Use Cases

### Check if a message sender has a phone number

```javascript
// Receive webhook
const message = webhookPayload.entry[0].changes[0].value.messages[0];

if (message.isLid) {
  // Try to get phone number from LID
  const response = await fetch(
    `/api/whatsapp/channels/${channelId}/lids/${message.from}`
  );
  
  if (response.ok) {
    const { pn } = await response.json();
    console.log(`Phone number found: ${pn}`);
  } else {
    console.log('Phone number not available - user has LID privacy enabled');
  }
}
```

### Get all LID mappings for analytics

```javascript
const response = await fetch(
  `/api/whatsapp/channels/${channelId}/lids?limit=1000`
);
const mappings = await response.json();

console.log(`Total known LID mappings: ${mappings.length}`);
```
