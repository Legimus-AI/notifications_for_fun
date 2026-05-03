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

/**
 * Maximum consecutive auto-heal attempts before giving up and only notifying
 */
export const MAX_HEAL_ATTEMPTS = 3;

/**
 * Delay between auto-heal call and re-check (ms). Gives Baileys time to handshake.
 */
export const HEAL_RECHECK_DELAY_MS = 10_000;

/**
 * Reasons that should NOT be auto-healed — notify directly.
 * `phone_not_registered`: number genuinely deactivated on WhatsApp
 * `status_logged_out`: WhatsApp invalidated the linked-device session, needs QR re-pair
 */
export const UNHEALABLE_REASONS = ['phone_not_registered', 'status_logged_out'];
