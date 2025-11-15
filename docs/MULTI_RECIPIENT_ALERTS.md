# Multi-Recipient Health Check Alerts

## Overview
The WhatsApp Health Check system now supports sending alerts to **multiple phone numbers** via CallMeBot. This allows you to notify multiple team members when WhatsApp channels become unhealthy.

## Configuration

### 1. Create Configuration File
All health check settings are centralized in `src/config/healthCheck.config.ts`:

```typescript
export interface CallMeBotRecipient {
  phone: string;
  apiKey: string;
  name?: string; // Optional name for logging
}

export const CALLMEBOT_RECIPIENTS: CallMeBotRecipient[] = [
  {
    phone: process.env.CALLMEBOT_PHONE_1 || '51983724476',
    apiKey: process.env.CALLMEBOT_API_KEY_1 || '4189609',
    name: 'Primary Alert Recipient',
  },
  {
    phone: process.env.CALLMEBOT_PHONE_2 || '56950056342',
    apiKey: process.env.CALLMEBOT_API_KEY_2 || '3714473',
    name: 'Secondary Alert Recipient',
  },
];
```

### 2. Environment Variables
Add these to your `.env` file:

```env
# Primary CallMeBot recipient
CALLMEBOT_PHONE_1=51983724476
CALLMEBOT_API_KEY_1=4189609

# Secondary CallMeBot recipient
CALLMEBOT_PHONE_2=56950056342
CALLMEBOT_API_KEY_2=3714473
```

### 3. Adding More Recipients

#### Option A: Add to Config File
Edit `src/config/healthCheck.config.ts` and add more entries to the array:

```typescript
export const CALLMEBOT_RECIPIENTS: CallMeBotRecipient[] = [
  {
    phone: process.env.CALLMEBOT_PHONE_1 || '51983724476',
    apiKey: process.env.CALLMEBOT_API_KEY_1 || '4189609',
    name: 'Primary Alert Recipient',
  },
  {
    phone: process.env.CALLMEBOT_PHONE_2 || '56950056342',
    apiKey: process.env.CALLMEBOT_API_KEY_2 || '3714473',
    name: 'Secondary Alert Recipient',
  },
  {
    phone: process.env.CALLMEBOT_PHONE_3 || '',
    apiKey: process.env.CALLMEBOT_API_KEY_3 || '',
    name: 'Third Alert Recipient',
  },
];
```

#### Option B: Add to Environment Variables
Add corresponding environment variables to your `.env` file:

```env
CALLMEBOT_PHONE_3=56999999999
CALLMEBOT_API_KEY_3=1234567
```

## How It Works

### Parallel Notification Delivery
When unhealthy channels are detected, the system:

1. **Builds the alert message** with all affected channels
2. **Sends notifications in parallel** to all configured recipients using `Promise.allSettled()`
3. **Logs individual results** for each recipient
4. **Reports summary** of successful and failed deliveries

### Example Log Output
```
📤 Sending health alert notification to 2 recipient(s)...
📱 Sending to Primary Alert Recipient (51983724476)...
📱 Sending to Secondary Alert Recipient (56950056342)...
✅ CallMeBot notification sent to 51983724476
✅ CallMeBot notification sent to 56950056342
✅ Notifications sent: 2 successful, 0 failed
```

## Benefits

### ✅ Redundancy
- If one recipient's phone is offline, others still receive alerts
- Multiple team members stay informed

### ✅ Parallel Delivery
- All notifications sent simultaneously
- No delay between recipients
- Uses `Promise.allSettled()` to handle failures gracefully

### ✅ Individual Tracking
- Each recipient's delivery status is logged
- Easy to identify delivery issues
- Named recipients for better logging

### ✅ Easy Configuration
- Centralized config file
- Environment variable support
- Simple to add/remove recipients

## Code Changes

### Files Modified
1. **`src/config/healthCheck.config.ts`** (NEW)
   - Centralized configuration
   - Recipient array with phone, apiKey, and name
   - Schedule and timezone settings

2. **`src/cronjobs/WhatsAppHealthCheckCron.ts`**
   - Import configuration from config file
   - Updated notification function to loop through recipients
   - Parallel notification sending with `Promise.allSettled()`
   - Individual result logging

3. **`docs/WHATSAPP_HEALTH_CHECK.md`**
   - Updated documentation with multi-recipient info
   - Configuration examples
   - Environment variable documentation

4. **`.env.healthcheck.example`** (NEW)
   - Example environment variables
   - Template for adding recipients

## Migration from Single Recipient

### Old Configuration (Deprecated)
```typescript
const CALLMEBOT_PHONE = process.env.CALLMEBOT_PHONE || '51983724476';
const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY || '4189609';
```

### New Configuration
```typescript
import { CALLMEBOT_RECIPIENTS } from '../config/healthCheck.config';

// Recipients are now an array
CALLMEBOT_RECIPIENTS.forEach(recipient => {
  sendCallMeBotNotification(recipient.phone, message, recipient.apiKey);
});
```

### Environment Variables Migration
**Old:**
```env
CALLMEBOT_PHONE=51983724476
CALLMEBOT_API_KEY=4189609
```

**New:**
```env
CALLMEBOT_PHONE_1=51983724476
CALLMEBOT_API_KEY_1=4189609
CALLMEBOT_PHONE_2=56950056342
CALLMEBOT_API_KEY_2=3714473
```

## Testing

### Test with Multiple Recipients
1. Add multiple recipients to config
2. Set environment variables
3. Restart server
4. Trigger health check manually: `GET /api/health_check/whatsapp`
5. Check logs for parallel notification delivery

### Expected Log Output
```
🏥 Starting WhatsApp health check...
🏥 Health check: Found 13 channels with isActive=true
❌ Unhealthy channels: 13
📤 Sending health alert notification to 2 recipient(s)...
📱 Sending to Primary Alert Recipient (51983724476)...
📱 Sending to Secondary Alert Recipient (56950056342)...
✅ CallMeBot notification sent to 51983724476
✅ CallMeBot notification sent to 56950056342
✅ Notifications sent: 2 successful, 0 failed
✅ WhatsApp health check completed
```

## Troubleshooting

### Issue: Only one recipient receives alerts
**Solution:** Check that all environment variables are set correctly in `.env`

### Issue: Some recipients fail
**Solution:** Check individual phone numbers and API keys. The system will continue sending to other recipients even if one fails.

### Issue: No alerts sent
**Solution:**
- Verify `CALLMEBOT_RECIPIENTS` array is not empty
- Check environment variables are loaded
- Verify CallMeBot API keys are valid

## Future Enhancements

Possible improvements:
- Database-stored recipients (dynamic configuration)
- Recipient groups (different alerts for different teams)
- SMS fallback if WhatsApp fails
- Email notifications
- Webhook support
- Rate limiting per recipient
