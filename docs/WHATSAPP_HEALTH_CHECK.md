# WhatsApp Health Check System

## Overview
The WhatsApp Health Check system monitors all active WhatsApp channels and sends alerts when channels become unhealthy.

## Automatic Cronjob

### Configuration
- **Schedule**: Runs every 5 minutes (`*/5 * * * *`)
- **Timezone**: UTC
- **Auto-start**: Automatically starts when the server starts
- **Location**: `src/cronjobs/WhatsAppHealthCheckCron.ts`

### How It Works
1. **Checks all active channels** with `isActive=true` in the database
2. **Performs deep health checks**:
   - Verifies connection exists in service
   - Checks connection status is 'active'
   - Validates phone number is still registered on WhatsApp
3. **Sends alerts** via CallMeBot when channels are unhealthy
4. **Alert throttling**: Maximum 3 consecutive alerts per channel to avoid spam

### Alert System
- Uses CallMeBot WhatsApp API to send notifications
- **Supports multiple recipients** - alerts are sent to all configured phone numbers
- Configured via environment variables (see Configuration section below)
- Alert format includes:
  - Number of affected channels
  - Channel IDs and phone numbers
  - Status descriptions with emojis
  - Timestamp
- Sends notifications in parallel to all recipients
- Logs success/failure for each recipient

### Status Types
- 🔌 **No Connection**: Connection doesn't exist in service
- ⚫ **Inactive**: Channel status is inactive
- 🔴 **Disconnected**: Channel is disconnected
- 🟡 **Connecting**: Channel is in connecting state
- 📱 **QR Ready**: Waiting for QR code scan
- 🔑 **Pairing Code Ready**: Waiting for pairing code
- ❌ **Number Not Registered**: Phone number not registered on WhatsApp
- ⚠️ **Check Error**: Error occurred during health check

## Manual Health Check Endpoints

### 1. GET /api/health_check/whatsapp
Manually trigger a health check for all WhatsApp channels.

**Response:**
```json
{
  "ok": true,
  "message": "Health check completed successfully",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "summary": {
    "total": 5,
    "healthy": 3,
    "unhealthy": 2
  },
  "healthy": [
    "channel-id-1",
    "channel-id-2",
    "channel-id-3"
  ],
  "affected": [
    {
      "channelId": "channel-id-4",
      "phoneNumber": "+51983724476",
      "status": "status_disconnected",
      "statusDescription": "Disconnected"
    },
    {
      "channelId": "channel-id-5",
      "phoneNumber": "+51987654321",
      "status": "no_connection",
      "statusDescription": "No Connection"
    }
  ]
}
```

### 2. GET /api/health_check/status
Alias for `/api/health_check/whatsapp` endpoint. Returns the same response.

## Recent Fix (2024)

### Issue
The cronjob was not running automatically even though it was being initialized.

### Root Cause
The `cron.schedule()` function creates a scheduled task but doesn't automatically start it. The task needs to be explicitly started by calling `.start()` on the returned task object.

### Solution
Added explicit call to `healthCheckJob.start()` after creating the cron schedule:

```typescript
healthCheckJob = cron.schedule(
  '*/5 * * * *',
  () => {
    executeHealthCheck();
  },
  {
    timezone: 'UTC',
  },
);

// Start the cron job explicitly
healthCheckJob.start();
```

### Verification
- ✅ Build passes without TypeScript errors
- ✅ Cronjob starts automatically when server starts
- ✅ Manual health check endpoints are available
- ✅ Health checks execute immediately on startup
- ✅ Health checks run every 5 minutes automatically

## Testing

### Test Manual Endpoint
```bash
# Test the manual health check
curl http://localhost:3000/api/health_check/whatsapp

# Or use the alias
curl http://localhost:3000/api/health_check/status
```

### Verify Cronjob is Running
Check server logs for:
```
🏥 Starting WhatsApp health check cron...
✅ WhatsApp health check cron started - running every 5 minutes
🏥 Starting WhatsApp health check...
✅ WhatsApp health check completed
```

## Configuration

### Environment Variables

The health check system supports **multiple CallMeBot recipients**. Configure them in your `.env` file:

```env
# Primary CallMeBot recipient
CALLMEBOT_PHONE_1=51983724476
CALLMEBOT_API_KEY_1=4189609

# Secondary CallMeBot recipient
CALLMEBOT_PHONE_2=56950056342
CALLMEBOT_API_KEY_2=3714473

# Add more recipients by following the pattern:
# CALLMEBOT_PHONE_3=...
# CALLMEBOT_API_KEY_3=...
```

### Configuration File

All health check settings are centralized in `src/config/healthCheck.config.ts`:

- **CALLMEBOT_RECIPIENTS**: Array of recipients with phone, apiKey, and optional name
- **MAX_CONSECUTIVE_ALERTS**: Maximum alerts per channel (default: 3)
- **HEALTH_CHECK_SCHEDULE**: Cron schedule (default: `*/5 * * * *` - every 5 minutes)
- **HEALTH_CHECK_TIMEZONE**: Timezone for cron job (default: `UTC`)

To add more recipients, update the `CALLMEBOT_RECIPIENTS` array in the config file and add corresponding environment variables.

## Architecture

```
Server Startup
    ↓
Initialize MongoDB
    ↓
Restore Active Channels
    ↓
Start WhatsApp Health Check Cron ← YOU ARE HERE
    ↓
    ├─→ Schedule: Every 5 minutes
    ├─→ Execute immediately
    └─→ Check all active channels
         ↓
         ├─→ Healthy → Reset alert counter
         └─→ Unhealthy → Increment counter → Send alert (if < 3)
```

## Maintenance

### Stop Cronjob
The cronjob automatically stops during graceful shutdown:
```typescript
stopWhatsAppHealthCheck();
```

### Modify Schedule
Edit the cron expression in `src/cronjobs/WhatsAppHealthCheckCron.ts`:
```typescript
healthCheckJob = cron.schedule(
  '*/5 * * * *',  // ← Change this
  // ...
);
```

Cron expression format: `minute hour day month weekday`
- `*/5 * * * *` - Every 5 minutes
- `0 * * * *` - Every hour
- `0 0 * * *` - Every day at midnight
- `0 */6 * * *` - Every 6 hours
