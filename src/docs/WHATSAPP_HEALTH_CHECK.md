# WhatsApp Health Check Cron Job

## Overview

The WhatsApp Health Check cron job monitors all active WhatsApp channel connections and sends notifications when channels become disconnected or unhealthy.

## Features

- ✅ Checks health of all active WhatsApp channels every 5 minutes
- ✅ Uses Baileys socket connection status to determine health
- ✅ Sends alerts via CallMeBot WhatsApp API when channels are unhealthy
- ✅ Logs all healthy and unhealthy channels for monitoring
- ✅ Functional programming approach for simplicity

## Architecture

### Files

1. **`/src/services/callMeBotWhatsAppNotifications.ts`**
   - Simple functional service to send WhatsApp notifications via CallMeBot API
   - Exports: `sendCallMeBotNotification(phone, message, apiKey)`

2. **`/src/cronjobs/WhatsAppHealthCheckCron.ts`**
   - Main health check cron job implementation
   - Uses `node-cron` for scheduling
   - Exports:
     - `startWhatsAppHealthCheck()` - Starts the cron job
     - `stopWhatsAppHealthCheck()` - Stops the cron job
     - `manualHealthCheck()` - Runs health check manually (for API endpoints)

3. **Integration in `/src/index.ts`**
   - Automatically starts on server startup
   - Gracefully stops on server shutdown

## Environment Variables

Add these to your `.env` file:

```env
# CallMeBot Configuration for Health Alerts
CALLMEBOT_PHONE=51983724476        # Phone number to receive alerts (with country code)
CALLMEBOT_API_KEY=4189609          # Your CallMeBot API key
```

### Getting CallMeBot API Key

1. Add the CallMeBot phone number (+34 644 84 46 07) to your contacts
2. Send this message: "I allow callmebot to send me messages"
3. Wait for the confirmation message with your API key
4. Add the API key to your `.env` file

## Health Check Logic

### Channel Selection
The health check **only monitors channels** where:
- `isActive: true` in the database
- `type: 'whatsapp_automated'`

Channels with `isActive: false` are completely ignored, regardless of their status.

### Health Status

The system performs a **deep health check** using Baileys to ensure connections are truly alive:

#### Health Check Levels:

1. **Connection Exists Check**
   - Verifies the channel has an active socket connection in WhatsAppService

2. **Status Check**
   - Confirms the connection status is `active`

3. **Phone Number Verification** (Baileys Integration)
   - Uses Baileys' `onWhatsApp()` method to verify the phone number is still registered on WhatsApp
   - This ensures the number hasn't been banned, deactivated, or unregistered

A WhatsApp channel is considered **healthy** if:
- ✅ Connection exists in WhatsAppService
- ✅ Connection status is `active`
- ✅ Phone number is still registered on WhatsApp (verified via Baileys)

A channel is considered **unhealthy** if any check fails:
- ❌ `no_connection` - No socket connection exists
- ❌ `status_*` - Connection exists but status is not active (inactive, disconnected, connecting, etc.)
- ❌ `phone_not_registered` - Phone number is no longer registered on WhatsApp (likely banned or deactivated)
- ❌ `check_error` - Error occurred during health check

### Alert Limiting
To prevent notification spam, the system implements **consecutive alert limiting**:
- Each channel can trigger a **maximum of 3 consecutive alerts**
- After 3 alerts, no more notifications are sent for that channel
- The counter **resets to 0** when the channel becomes healthy again
- If a channel disconnects again after recovery, it can trigger 3 new alerts

**Example scenario:**
1. Channel disconnects → Alert 1 sent
2. Still disconnected (5 min later) → Alert 2 sent
3. Still disconnected (5 min later) → Alert 3 sent
4. Still disconnected (5 min later) → No alert (max reached)
5. Channel becomes healthy → Counter resets to 0
6. Channel disconnects again → Alert 1 sent (new cycle)

## Cron Schedule

The health check runs **every 5 minutes**:
- Cron expression: `*/5 * * * *`
- Timezone: UTC
- First run: Immediately on server startup

## Usage

### Automatic (Default)

The health check automatically starts when the server starts:

```typescript
// This happens automatically in src/index.ts
startWhatsAppHealthCheck();
```

### Manual Health Check

You can run a manual health check (useful for API endpoints):

```typescript
import { manualHealthCheck } from './cronjobs/WhatsAppHealthCheckCron';

const result = await manualHealthCheck();
console.log('Healthy channels:', result.healthy);
console.log('Unhealthy channels:', result.unhealthy);
```

### Stop Health Check

To stop the cron job:

```typescript
import { stopWhatsAppHealthCheck } from './cronjobs/WhatsAppHealthCheckCron';

stopWhatsAppHealthCheck();
```

## Notification Format

When unhealthy channels are detected, a beautifully formatted notification is sent:

```
🚨 WhatsApp Health Alert 🚨

📊 2 channels are affected

━━━━━━━━━━━━━━━━━━━━

1. ❌ *+51983724476*
   └─ ID: `14b8e6ca`
   └─ Status: Number Not Registered

2. 🔴 *+56986070574*
   └─ ID: `439288de`
   └─ Status: Disconnected

━━━━━━━━━━━━━━━━━━━━
⏰ 11/14/24, 3:45 PM UTC
```

**Format features:**
- 🚨 **Header**: Eye-catching alert header with emojis
- 📊 **Summary**: Clear count of affected channels
- 📱 **Phone Numbers**: Formatted with + prefix for international format
- 🎯 **Status Icons**: Visual emojis for quick status identification:
  - 🔌 No Connection
  - ⚫ Inactive
  - 🔴 Disconnected
  - 🟡 Connecting
  - 📱 QR Ready
  - 🔑 Pairing Code Ready
  - ❌ Number Not Registered
  - ⚠️ Check Error
- 📋 **Structured Layout**: Tree-style formatting with clear hierarchy
- ⏰ **Timestamp**: UTC timestamp for reference
- **Separators**: Visual separators for better readability

**Status Descriptions:**
- Human-readable status descriptions instead of technical codes
- Automatic formatting of status codes (e.g., `phone_not_registered` → "Number Not Registered")

## Logs

The health check produces detailed console logs:

```
🏥 Starting WhatsApp health check...
🏥 Health check: Found 5 channels with isActive=true
✅ channel-1 is healthy (status: active)
✅ channel-2 is healthy (status: active)
❌ channel-3 is unhealthy (status: connecting, phone: 51983724476)
📊 channel-3: First alert (1/3)
❌ channel-4 is unhealthy (status: inactive, phone: 56986070574)
📊 channel-4: Alert 2/3
⏭️ channel-5: Max alerts (3) reached, skipping notification
✅ Healthy channels: 2
❌ Unhealthy channels: 3
📋 Healthy channels: channel-1, channel-2
📋 Unhealthy channels: channel-3, channel-4, channel-5
📤 Sending health alert notification via CallMeBot...
✅ CallMeBot notification sent to 51983724476
✅ WhatsApp health check completed
```

**Log indicators:**
- `📊` - Alert counter status
- `⏭️` - Channel skipped due to max alerts reached
- `🔄` - Alert counter reset (channel became healthy)

## Integration with WhatsAppService

The health check uses these methods from `WhatsAppService`:

- `getActiveConnections()` - Returns array of channelIds with active sockets
- `getChannelStatus(channelId)` - Returns current status of a channel
- `checkIdExists(channelId, jid)` - Checks if a phone number is registered on WhatsApp using Baileys' `onWhatsApp()` method

## Baileys Integration

The health check leverages Baileys' native functionality to verify connections:

### `onWhatsApp()` Method
This method queries WhatsApp servers to check if a phone number is registered:

```typescript
const result = await sock.onWhatsApp('1234567890@s.whatsapp.net');
// Returns: { exists: true/false, jid: '1234567890@s.whatsapp.net' }
```

**Benefits:**
- Detects banned or deactivated numbers immediately
- Identifies phantom connections (connected but number no longer valid)
- Provides real-time verification against WhatsApp servers
- Prevents sending messages to invalid numbers

**When a number fails verification:**
- Status shows as `phone_not_registered`
- Alerts are sent immediately
- System knows the connection needs re-authentication or replacement

## Best Practices

1. **Monitor the logs** regularly to identify patterns in disconnections
2. **Test the notification** by temporarily stopping a channel
3. **Adjust the schedule** if 5 minutes is too frequent (edit the cron expression)
4. **Keep CallMeBot API key secure** - don't commit it to version control

## Troubleshooting

### Notifications not being sent

1. Verify `CALLMEBOT_PHONE` and `CALLMEBOT_API_KEY` are set in `.env`
2. Check CallMeBot API key is active (send a test message)
3. Ensure the phone number format includes country code (e.g., 51983724476)

### Health check not running

1. Check server logs for "Starting WhatsApp health check cron"
2. Verify `node-cron` is installed
3. Check for errors in the startup sequence

### False positives (healthy channels marked as unhealthy)

1. Check if channels are in transition states (`connecting`, `qr_ready`)
2. Increase the health check interval to reduce false positives during reconnections
3. Review the channel's actual connection status in the database

## Future Enhancements

- Add email notifications as fallback
- Implement retry logic for failed notifications
- Add health check metrics to monitoring dashboard
- Support custom notification templates
- Add channel auto-recovery attempts

