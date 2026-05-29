/**
 * Alert delivery configuration
 *
 * Single transport: WhatsApp Cloud-style endpoint.
 *
 * Why we removed Telegram Ghost and CallMeBot (2026-05-29):
 *   - Telegram Ghost: the configured channelId stopped existing in the
 *     channels collection ("Channel 41918720-... not found") and every
 *     health-tick spammed retries → noise + leak vector.
 *   - CallMeBot: account paused upstream (HTTP 208 "Your Account is
 *     Paused"); no SLA, no path to resume cleanly.
 *
 * If WhatsApp is the system being monitored, this means a WA-health alert
 * goes via WA itself and may not deliver during a full outage. That trade-
 * off is accepted explicitly while the gateway is being stabilized — once
 * a fanout target (Telegram bot / internal webhook) is wired, add it here.
 */

export type WhatsAppCloudRecipient = {
  /** UUID of a `type: 'whatsapp_automated'` channel (must be healthy to deliver) */
  channelId: string;
  /** Recipient phone in international format without `+` (e.g. `'51983724476'`) */
  recipient: string;
  name?: string;
};

/**
 * Primary (and currently only) alert path. Override with env:
 *   ALERT_WHATSAPP_CHANNEL_ID, ALERT_WHATSAPP_RECIPIENT.
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
 * WhatsApp delivery is enabled by default now that the other transports
 * were removed. Flip ALERT_ENABLE_WHATSAPP=false to mute alerts entirely.
 */
export const ENABLE_WHATSAPP_FALLBACK =
  (process.env.ALERT_ENABLE_WHATSAPP ?? 'true') !== 'false';
