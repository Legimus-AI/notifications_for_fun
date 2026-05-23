import { telegramGhostCallerService } from './TelegramGhostCallerService';
import { whatsAppService } from './WhatsAppService';
import { sendCallMeBotNotification } from './callMeBotWhatsAppNotifications';
import {
  TELEGRAM_GHOST_RECIPIENTS,
  WHATSAPP_FALLBACK_RECIPIENTS,
  ENABLE_WHATSAPP_FALLBACK,
  ENABLE_CALLMEBOT_FALLBACK,
} from '../config/alertRecipients.config';
import { CALLMEBOT_RECIPIENTS } from '../config/healthCheck.config';

export type AlertDeliveryChannel =
  | 'telegram_ghost'
  | 'whatsapp_cloud'
  | 'callmebot';

export type AlertDeliveryResult = {
  channel: AlertDeliveryChannel;
  recipient: string;
  name?: string;
  ok: boolean;
  messageId?: string | number;
  error?: string;
};

/**
 * Hard cap so an oversized message doesn't get rejected by Telegram (4096
 * char limit) or WhatsApp (also ~4096). Truncate with a visible marker so
 * the reader knows context was lost.
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
 * Dispatch an alert across every configured channel in parallel.
 *
 * Returns ALL outcomes so the caller can log per-channel success/failure
 * (callers should NOT treat a single success as "delivered" — they should
 * know which recipient actually got the message).
 *
 * Each channel is best-effort and never throws; failures are reported in
 * the returned array so a broken sub-system can't crash the cron tick.
 *
 * WHY default to Telegram-only: WhatsApp health alerts fire when WA is
 * down by definition, so sending the alert via WhatsApp would silently
 * fail. Telegram (MTProto user session) lives in a separate fate domain.
 * Set ENABLE_WHATSAPP_FALLBACK=true to also dispatch via WhatsApp when
 * the alert is unrelated to WA health (future ops alerts).
 */
export const sendAlertToAllRecipients = async (
  message: string,
): Promise<AlertDeliveryResult[]> => {
  const cappedMessage = capMessageLength(message);

  // Track each task alongside its provider metadata so a rejected promise
  // can be attributed to the correct channel/recipient (otherwise the log
  // would mislabel every unexpected throw as `telegram_ghost`/`unknown`).
  type Tracked = {
    channel: AlertDeliveryChannel;
    recipient: string;
    name?: string;
    task: Promise<AlertDeliveryResult>;
  };
  const tracked: Tracked[] = [];

  for (const telegramRecipient of TELEGRAM_GHOST_RECIPIENTS) {
    tracked.push({
      channel: 'telegram_ghost',
      recipient: telegramRecipient.recipient,
      name: telegramRecipient.name,
      task: deliverViaTelegramGhost(
        telegramRecipient.channelId,
        telegramRecipient.recipient,
        cappedMessage,
        telegramRecipient.name,
      ),
    });
  }

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

  if (ENABLE_CALLMEBOT_FALLBACK) {
    for (const callMeBotRecipient of CALLMEBOT_RECIPIENTS) {
      tracked.push({
        channel: 'callmebot',
        recipient: callMeBotRecipient.phone,
        name: callMeBotRecipient.name,
        task: deliverViaCallMeBot(
          callMeBotRecipient.phone,
          cappedMessage,
          callMeBotRecipient.apiKey,
          callMeBotRecipient.name,
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

const deliverViaTelegramGhost = async (
  channelId: string,
  recipient: string,
  message: string,
  name?: string,
): Promise<AlertDeliveryResult> => {
  try {
    const result = await telegramGhostCallerService.sendMessage(channelId, {
      recipient,
      text: message,
    });
    return {
      channel: 'telegram_ghost',
      recipient,
      name,
      ok: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  } catch (error: any) {
    return {
      channel: 'telegram_ghost',
      recipient,
      name,
      ok: false,
      error: error?.message ?? String(error),
    };
  }
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

const deliverViaCallMeBot = async (
  phone: string,
  message: string,
  apiKey: string,
  name?: string,
): Promise<AlertDeliveryResult> => {
  try {
    const ok = await sendCallMeBotNotification(phone, message, apiKey);
    return {
      channel: 'callmebot',
      recipient: phone,
      name,
      ok,
      error: ok ? undefined : 'CallMeBot returned non-200',
    };
  } catch (error: any) {
    return {
      channel: 'callmebot',
      recipient: phone,
      name,
      ok: false,
      error: error?.message ?? String(error),
    };
  }
};
