import { whatsAppService } from './WhatsAppService';
import {
  WHATSAPP_FALLBACK_RECIPIENTS,
  ENABLE_WHATSAPP_FALLBACK,
} from '../config/alertRecipients.config';

export type AlertDeliveryChannel = 'whatsapp_cloud';

export type AlertDeliveryResult = {
  channel: AlertDeliveryChannel;
  recipient: string;
  name?: string;
  ok: boolean;
  messageId?: string | number;
  error?: string;
};

/**
 * Hard cap so an oversized message doesn't get rejected by WhatsApp
 * (~4096 char limit). Truncate with a visible marker so the reader knows
 * context was lost.
 *
 * WHY Array.from: alerts contain emojis (🚨 📊). String.slice cuts by UTF-16
 * code units and would split surrogate pairs, producing invalid UTF-8 that
 * the API would reject or render as ��. Array.from iterates by code points.
 */
const MAX_ALERT_CODEPOINTS = 4000;

const capMessageLength = (message: string): string => {
  const codepoints = Array.from(message);
  if (codepoints.length <= MAX_ALERT_CODEPOINTS) return message;
  return `${codepoints.slice(0, MAX_ALERT_CODEPOINTS - 20).join('')}\n…[truncated]`;
};

/**
 * Dispatch an alert via every enabled transport (currently WhatsApp Cloud
 * only — Telegram Ghost and CallMeBot were removed on 2026-05-29).
 *
 * Returns ALL outcomes so the caller can log per-recipient success/failure.
 * Each delivery is best-effort and never throws.
 *
 * WHY a single transport is acceptable for now: the gateway being monitored
 * IS WhatsApp, so a WA-side outage may swallow the alert. That trade-off
 * is accepted explicitly while we stabilize the gateway; if a separate
 * fanout (Telegram bot / webhook) is wired later, add it back here.
 */
export const sendAlertToAllRecipients = async (
  message: string,
): Promise<AlertDeliveryResult[]> => {
  const cappedMessage = capMessageLength(message);

  type Tracked = {
    channel: AlertDeliveryChannel;
    recipient: string;
    name?: string;
    task: Promise<AlertDeliveryResult>;
  };
  const tracked: Tracked[] = [];

  if (ENABLE_WHATSAPP_FALLBACK) {
    for (const whatsappRecipient of WHATSAPP_FALLBACK_RECIPIENTS) {
      tracked.push({
        channel: 'whatsapp_cloud',
        recipient: whatsappRecipient.recipient,
        name: whatsappRecipient.name,
        task: deliverViaWhatsApp(
          whatsappRecipient.channelId,
          whatsappRecipient.recipient,
          cappedMessage,
          whatsappRecipient.name,
        ),
      });
    }
  }

  const settled = await Promise.allSettled(tracked.map((t) => t.task));
  return settled.map((outcome, index) => {
    const meta = tracked[index];
    if (outcome.status === 'fulfilled') return outcome.value;
    return {
      channel: meta.channel,
      recipient: meta.recipient,
      name: meta.name,
      ok: false,
      error: `Delivery task unexpectedly threw: ${outcome.reason}`,
    };
  });
};

const deliverViaWhatsApp = async (
  channelId: string,
  recipient: string,
  message: string,
  name?: string,
): Promise<AlertDeliveryResult> => {
  try {
    // Skip silently if the alert channel itself is down — we'd just be
    // attempting to send a "WhatsApp is down" message via a dead WA socket.
    const isActive = whatsAppService.getActiveConnections().includes(channelId);
    if (!isActive) {
      return {
        channel: 'whatsapp_cloud',
        recipient,
        name,
        ok: false,
        error: `WhatsApp alert channel ${channelId} is not connected`,
      };
    }

    const result = await whatsAppService.sendMessageFromApi(channelId, {
      to: recipient,
      type: 'text',
      text: { body: message },
    });

    const messageId = result?.messages?.[0]?.id;
    return {
      channel: 'whatsapp_cloud',
      recipient,
      name,
      ok: Boolean(messageId),
      messageId,
      error: messageId ? undefined : 'No message id in response',
    };
  } catch (error: any) {
    return {
      channel: 'whatsapp_cloud',
      recipient,
      name,
      ok: false,
      error: error?.message ?? String(error),
    };
  }
};
