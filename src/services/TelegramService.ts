import axios from 'axios';
import Channel from '../models/Channels';
import {
  TelegramMessage,
  TelegramMessageResponse,
} from '../types/Telegram';
import { decodeBase64Payload, assertSafeMediaUrl } from '../helpers/media';

/**
 * Default HTTP timeouts for Telegram Bot API calls (ms).
 * Multipart uploads get a longer window because the bot has to receive the file body.
 */
const TELEGRAM_JSON_TIMEOUT_MS = 30_000;
const TELEGRAM_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Map a Cloud-API-style message type to a Telegram Bot API method + media field name.
 * Types not in this map (text, location, contact, etc.) get custom handling in the switch.
 */
const MEDIA_METHOD_MAP: Record<string, { method: string; field: string }> = {
  image: { method: 'sendPhoto', field: 'photo' },
  audio: { method: 'sendAudio', field: 'audio' },
  voice: { method: 'sendVoice', field: 'voice' },
  video: { method: 'sendVideo', field: 'video' },
  document: { method: 'sendDocument', field: 'document' },
  sticker: { method: 'sendSticker', field: 'sticker' },
  animation: { method: 'sendAnimation', field: 'animation' },
};

/**
 * Resolve a media payload into either a URL string (for Telegram fetch) or a
 * Blob (for multipart upload of base64 data).
 */
function resolveMediaSource(
  mediaPayload: any,
  typeLabel: string,
): { kind: 'url'; value: string } | { kind: 'blob'; value: Blob; filename: string } {
  if (mediaPayload?.link) {
    // SSRF guard: Telegram fetches this URL server-side from its
    // infrastructure — even if Telegram itself filters, we should
    // refuse to forward obviously bad inputs to a public API.
    return { kind: 'url', value: assertSafeMediaUrl(mediaPayload.link) };
  }
  if (mediaPayload?.data) {
    const buffer = decodeBase64Payload(mediaPayload.data);
    // Cast to BlobPart: Node's Buffer is structurally a Uint8Array, but its
    // backing `buffer` type widens to ArrayBufferLike (incl. SharedArrayBuffer)
    // which the DOM Blob ctor's lib types reject.
    const blob = new Blob([buffer as unknown as BlobPart], {
      type: mediaPayload.mime_type ?? 'application/octet-stream',
    });
    return {
      kind: 'blob',
      value: blob,
      filename: mediaPayload.filename ?? `${typeLabel}.bin`,
    };
  }
  throw new Error(
    `"link" or "data" (base64) is required for media type "${typeLabel}"`,
  );
}

export class TelegramService {
  private readonly TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

  /**
   * Gets bot token from database
   */
  private async getBotToken(channelId: string): Promise<string> {
    const channel = await Channel.findOne({ channelId });
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const config = channel.config as any;
    if (!config.botToken) {
      throw new Error('Bot token is required');
    }

    return config.botToken;
  }

  /**
   * Low-level call to a Telegram Bot API method with JSON body.
   */
  private async callApi(
    botToken: string,
    method: string,
    body: Record<string, any>,
  ): Promise<any> {
    const response = await axios.post(
      `${this.TELEGRAM_API_BASE}${botToken}/${method}`,
      body,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: TELEGRAM_JSON_TIMEOUT_MS,
      },
    );
    if (!response.data.ok) {
      throw new Error(
        `Telegram API ${method} failed: ${response.data.description ?? 'unknown error'}`,
      );
    }
    return response.data;
  }

  /**
   * Low-level call to a Telegram Bot API method with multipart body
   * (used when uploading base64 media).
   */
  private async callApiMultipart(
    botToken: string,
    method: string,
    fields: Record<string, any>,
    file: { field: string; blob: Blob; filename: string },
  ): Promise<any> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      form.append(
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      );
    }
    form.append(file.field, file.blob, file.filename);

    const response = await axios.post(
      `${this.TELEGRAM_API_BASE}${botToken}/${method}`,
      form,
      { timeout: TELEGRAM_UPLOAD_TIMEOUT_MS },
    );
    if (!response.data.ok) {
      throw new Error(
        `Telegram API ${method} failed: ${response.data.description ?? 'unknown error'}`,
      );
    }
    return response.data;
  }

  /**
   * Sends a message to a Telegram chat (legacy text-only endpoint).
   */
  async sendMessage(
    channelId: string,
    message: TelegramMessage,
  ): Promise<TelegramMessageResponse> {
    try {
      const botToken = await this.getBotToken(channelId);
      return (await this.callApi(
        botToken,
        'sendMessage',
        message as any,
      )) as TelegramMessageResponse;
    } catch (error: any) {
      console.error(`❌ Error sending Telegram message:`, error);
      if (error.response?.data) {
        throw new Error(
          `Telegram API error: ${error.response.data.description || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Unified Cloud-API-style message endpoint. Maps `payload.type` to the
   * matching Telegram Bot API method.
   *
   * Supported types: text, image, audio, voice, video, document, sticker,
   * animation, location, contact.
   */
  async sendMessageFromApi(channelId: string, payload: any): Promise<any> {
    try {
      const botToken = await this.getBotToken(channelId);
      const chatId = payload.to ?? payload.chat_id;
      if (!chatId) {
        throw new Error('Recipient "to" (or "chat_id") is required');
      }

      switch (payload.type) {
        case 'text': {
          const text = payload.text?.body;
          if (!text) {
            throw new Error('"text.body" is required for text type');
          }
          return await this.callApi(botToken, 'sendMessage', {
            chat_id: chatId,
            text,
            parse_mode: payload.text.parse_mode,
            disable_web_page_preview: payload.text.disable_web_page_preview,
            reply_to_message_id: payload.context?.message_id,
          });
        }
        case 'image':
        case 'audio':
        case 'voice':
        case 'video':
        case 'document':
        case 'sticker':
        case 'animation': {
          const mapping = MEDIA_METHOD_MAP[payload.type];
          const mediaPayload = payload[payload.type];
          const source = resolveMediaSource(mediaPayload, payload.type);
          const baseFields: Record<string, any> = {
            chat_id: chatId,
            caption: mediaPayload?.caption,
            parse_mode: mediaPayload?.parse_mode,
            reply_to_message_id: payload.context?.message_id,
          };
          if (source.kind === 'url') {
            // Telegram Bot API has NO top-level `filename` field for
            // sendDocument when sending by URL/file_id. The filename is
            // derived from the URL basename. If a custom filename is
            // required, the caller must POST base64 via `data` (multipart).
            return await this.callApi(botToken, mapping.method, {
              ...baseFields,
              [mapping.field]: source.value,
            });
          }
          // Multipart: filename IS honored (it becomes the form-data filename).
          // Prefer the user-supplied document filename for documents.
          const uploadFilename =
            payload.type === 'document' && mediaPayload?.filename
              ? mediaPayload.filename
              : source.filename;
          return await this.callApiMultipart(
            botToken,
            mapping.method,
            baseFields,
            {
              field: mapping.field,
              blob: source.value,
              filename: uploadFilename,
            },
          );
        }
        case 'location': {
          const loc = payload.location;
          if (loc?.latitude === undefined || loc?.longitude === undefined) {
            throw new Error(
              '"latitude" and "longitude" are required for location type',
            );
          }
          return await this.callApi(botToken, 'sendLocation', {
            chat_id: chatId,
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            horizontal_accuracy: loc.horizontal_accuracy,
            live_period: loc.live_period,
          });
        }
        case 'contacts':
        case 'contact': {
          const contact = (payload.contacts ?? [payload.contact])[0];
          if (!contact) {
            throw new Error('"contacts" array is required for contact type');
          }
          const phone = contact.phones?.[0]?.phone;
          if (!phone) {
            throw new Error('contact must include at least one phone number');
          }
          return await this.callApi(botToken, 'sendContact', {
            chat_id: chatId,
            phone_number: phone,
            first_name:
              contact.name?.first_name ??
              contact.name?.formatted_name ??
              'Contact',
            last_name: contact.name?.last_name,
            vcard: contact.vcard,
          });
        }
        default:
          throw new Error(`Unsupported message type: "${payload.type}"`);
      }
    } catch (error: any) {
      console.error(`❌ Error sending Telegram message from API:`, error);
      if (error.response?.data) {
        throw new Error(
          `Telegram API error: ${error.response.data.description || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * No-op for compatibility
   */
  async restoreActiveChannels(): Promise<void> {
    console.log('✅ Telegram service ready (no restoration needed)');
  }
}

export const telegramService = new TelegramService();
