# Health Check API Documentation

## Overview

The Health Check API provides endpoints to manually check the health status of all WhatsApp channels and get information about the health check system.

## Base URL

```
/api/health_check
```

**Note:** The URL uses an underscore (`_`), not a hyphen (`-`).

## Authentication

All endpoints require JWT authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

---

## Endpoints

### 1. Check WhatsApp Health

Manually trigger a health check for all active WhatsApp channels.

**Endpoint:** `GET /api/health_check/whatsapp`

**Authentication:** Required

**Description:**
- Performs a deep health check on all channels with `isActive: true`
- Uses Baileys to verify phone number registration
- Returns detailed information about healthy and affected channels

#### Response

**Success Response (200 OK):**

```json
{
  "ok": true,
  "message": "Health check completed successfully",
  "timestamp": "2024-11-14T20:45:30.123Z",
  "summary": {
    "total": 12,
    "healthy": 10,
    "unhealthy": 2
  },
  "healthy": [
    "channel-id-1",
    "channel-id-2",
    "channel-id-3"
  ],
  "affected": [
    {
      "channelId": "14b8e6ca-7732-41f5-a376-6a697ad2d7ed",
      "phoneNumber": "51983724476",
      "status": "phone_not_registered",
      "statusDescription": "Number Not Registered"
    },
    {
      "channelId": "439288de-2bc7-4800-83e0-34585736da97",
      "phoneNumber": "56986070574",
      "status": "status_inactive",
      "statusDescription": "Inactive"
    }
  ]
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Request success status |
| `message` | string | Response message |
| `timestamp` | string | ISO 8601 timestamp of the check |
| `summary.total` | number | Total number of channels checked |
| `summary.healthy` | number | Number of healthy channels |
| `summary.unhealthy` | number | Number of affected channels |
| `healthy` | string[] | Array of healthy channel IDs |
| `affected` | array | Array of affected channel objects |
| `affected[].channelId` | string | Channel UUID |
| `affected[].phoneNumber` | string\|null | Associated phone number |
| `affected[].status` | string | Technical status code |
| `affected[].statusDescription` | string | Human-readable status |

#### Status Codes

**Possible `status` values:**
- `no_connection` - No socket connection exists
- `status_inactive` - Connection inactive
- `status_disconnected` - Disconnected
- `status_connecting` - Currently connecting
- `status_qr_ready` - QR code ready for scanning
- `status_pairing_code_ready` - Pairing code ready
- `phone_not_registered` - Phone number not registered on WhatsApp
- `check_error` - Error during health check

#### Example Request

```bash
curl -X GET \
  'https://your-api.com/api/health_check/whatsapp' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

#### Example Response (No Affected Channels)

```json
{
  "ok": true,
  "message": "Health check completed successfully",
  "timestamp": "2024-11-14T20:45:30.123Z",
  "summary": {
    "total": 5,
    "healthy": 5,
    "unhealthy": 0
  },
  "healthy": [
    "channel-1",
    "channel-2",
    "channel-3",
    "channel-4",
    "channel-5"
  ],
  "affected": []
}
```

---

### 2. Get Health Check Status (Alias)

Shorter endpoint for checking health status of all phone numbers.

**Endpoint:** `GET /api/health_check/status`

**Authentication:** Not Required (Public)

**Description:**
- This is an alias/shortcut for the `/whatsapp` endpoint
- Returns exactly the same response
- Useful for simpler URL structure

#### Response

Returns the exact same response as `GET /api/health_check/whatsapp`. See [Response](#response) above for full details.

#### Example Request

```bash
curl -X GET 'https://your-api.com/api/health_check/status'
```

**Note:** Both endpoints (`/whatsapp` and `/status`) return identical results - use whichever URL you prefer.

---

## Error Responses

### Authentication Error (401)

```json
{
  "errors": {
    "msg": "UNAUTHORIZED"
  }
}
```

### Server Error (500)

```json
{
  "errors": {
    "msg": "ERROR_MESSAGE_HERE"
  }
}
```

---

## Use Cases

### 1. Dashboard Integration

Display real-time health status of all WhatsApp channels in your admin dashboard:

```javascript
async function fetchChannelHealth() {
  const response = await fetch('/api/health_check/whatsapp', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();

  console.log(`Total: ${data.summary.total}`);
  console.log(`Healthy: ${data.summary.healthy}`);
  console.log(`Issues: ${data.summary.unhealthy}`);

  // Display affected channels
  data.affected.forEach(channel => {
    console.log(`❌ ${channel.phoneNumber} - ${channel.statusDescription}`);
  });
}
```

### 2. Monitoring Script

Create a monitoring script that checks health and alerts on issues:

```javascript
const checkHealth = async () => {
  const res = await fetch('/api/health_check/whatsapp', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();

  if (data.summary.unhealthy > 0) {
    // Send alert to team
    sendAlertToTeam({
      message: `⚠️ ${data.summary.unhealthy} WhatsApp channels need attention`,
      affected: data.affected
    });
  }
};
```

### 3. Before Sending Bulk Messages

Check channel health before initiating bulk message campaigns:

```javascript
async function canSendBulkMessages() {
  const health = await fetch('/api/health_check/whatsapp', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await health.json();

  if (data.summary.unhealthy > 0) {
    console.warn(`Warning: ${data.summary.unhealthy} channels are affected`);
    return {
      canSend: data.summary.healthy > 0,
      availableChannels: data.healthy.length,
      issues: data.affected
    };
  }

  return { canSend: true, availableChannels: data.healthy.length };
}
```

---

## Integration with Automated Health Checks

The manual health check endpoint uses the same logic as the automated cron job that runs every 5 minutes.

**Key differences:**
- Manual check: Returns full details immediately via API
- Automated check: Runs in background and sends CallMeBot notifications

Both use:
- ✅ Deep connection verification
- ✅ Baileys phone number validation
- ✅ Multi-level health checks

---

## Notes

1. **Performance**: The health check queries all active channels and verifies phone numbers via Baileys. For systems with many channels (50+), the check may take a few seconds.

2. **Rate Limiting**: Consider implementing rate limiting on this endpoint to prevent abuse, as each check queries WhatsApp servers.

3. **Caching**: The endpoint performs a live check each time. If you need frequent polling, consider implementing caching with a TTL.

4. **Alert Counter**: The manual check does NOT increment the alert counter used by the automated system. It's purely for information retrieval.

---

## Related Documentation

- [WhatsApp Health Check System](./WHATSAPP_HEALTH_CHECK.md)
- [Baileys Integration](https://whiskeysockets.github.io/Baileys/)
- [CallMeBot API](https://www.callmebot.com/blog/free-api-whatsapp-messages/)

