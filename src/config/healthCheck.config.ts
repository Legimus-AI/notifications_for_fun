/**
 * Health Check Configuration
 * Configure CallMeBot recipients for WhatsApp health alerts
 */

export interface CallMeBotRecipient {
  phone: string;
  apiKey: string;
  name?: string; // Optional name for logging purposes
}

/**
 * CallMeBot recipients configuration
 * Add multiple phone numbers that should receive health alerts
 */
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

/**
 * Maximum consecutive alerts before stopping notifications for a channel
 */
export const MAX_CONSECUTIVE_ALERTS = 3;

/**
 * Health check cron schedule (every 5 minutes)
 */
export const HEALTH_CHECK_SCHEDULE = '*/5 * * * *';

/**
 * Health check timezone
 */
export const HEALTH_CHECK_TIMEZONE = 'UTC';
