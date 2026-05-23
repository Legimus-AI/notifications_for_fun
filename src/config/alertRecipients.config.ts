/**
 * Alert delivery configuration
 *
 * Routes WhatsApp health-check alerts (and any future ops alert) through
 * Telegram by default — when WhatsApp is the system being monitored, you
 * cannot rely on WhatsApp itself to deliver "WhatsApp is down" notices.
 *
 * Priority order:
 *   1. Telegram Ghost (MTProto user session, independent fate domain) — ALWAYS ON
 *   2. WhatsApp Cloud-style endpoint — opt-in (ENABLE_WHATSAPP_FALLBACK=true)
 *   3. CallMeBot legacy — opt-in (ENABLE_CALLMEBOT_FALLBACK=true)
 */

export type TelegramGhostRecipient = {
  /** UUID of a `type: 'telegram_ghost_caller'` channel in the channels collection */
  channelId: string;
  /** gramJS entity selector: `'me'` (Saved Messages), `'@username'`, or `'+phone'` */
  recipient: string;
  name?: string;
};

export type WhatsAppCloudRecipient = {
  /** UUID of a `type: 'whatsapp_automated'` channel (must be healthy to deliver) */
  channelId: string;
  /** Recipient phone in international format without `+` (e.g. `'51983724476'`) */
  recipient: string;
  name?: string;
};

/**
 * Primary alert path. Saved Messages of the ghost caller account is the
 * default — guaranteed delivery to whoever owns that Telegram number, no
 * contact import dance required.
 *
 * Override with env: ALERT_TELEGRAM_GHOST_CHANNEL_ID, ALERT_TELEGRAM_GHOST_RECIPIENT.
 */
export const TELEGRAM_GHOST_RECIPIENTS: TelegramGhostRecipient[] = [
  {
    channelId:
      process.env.ALERT_TELEGRAM_GHOST_CHANNEL_ID ||
      '41918720-d3af-4857-a753-815ed991058f',
    recipient: process.env.ALERT_TELEGRAM_GHOST_RECIPIENT || 'me',
    name: 'Telegram Ghost (Saved Messages)',
  },
];

/**
 * Secondary path. NOT used for WhatsApp-health alerts (would self-defeat).
 * Set ENABLE_WHATSAPP_FALLBACK=true to enable for non-WA-health alerts.
 *
 * Override with env: ALERT_WHATSAPP_CHANNEL_ID, ALERT_WHATSAPP_RECIPIENT.
 */
export const WHATSAPP_FALLBACK_RECIPIENTS: WhatsAppCloudRecipient[] = [
  {
    channelId:
      process.env.ALERT_WHATSAPP_CHANNEL_ID ||
      '15a676f0-1def-468f-b146-a39f363ea057',
    recipient: process.env.ALERT_WHATSAPP_RECIPIENT || '51983724476',
    name: 'Victor WhatsApp',
  },
];

/**
 * Enable WhatsApp delivery for alerts. Default OFF because WhatsApp
 * health alerts (the dominant use case) would self-defeat if dispatched
 * via WhatsApp itself.
 */
export const ENABLE_WHATSAPP_FALLBACK =
  process.env.ALERT_ENABLE_WHATSAPP === 'true';

/**
 * Toggle the legacy CallMeBot path. Account is currently paused (status 208)
 * — set ALERT_ENABLE_CALLMEBOT=true to re-enable once CallMeBot is resumed.
 */
export const ENABLE_CALLMEBOT_FALLBACK =
  process.env.ALERT_ENABLE_CALLMEBOT === 'true';
