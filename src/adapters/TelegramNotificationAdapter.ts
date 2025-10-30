import { INotificationProvider } from '../interfaces/INotificationProvider';
import { telegramService } from '../services/TelegramService';
import { TelegramMessage } from '../types/Telegram';

/**
 * Telegram Adapter - Adapts TelegramService to INotificationProvider interface
 * This is an Adapter in the Adapter pattern
 */
export class TelegramNotificationAdapter implements INotificationProvider {
  /**
   * Sends a message through Telegram
   */
  async send(
    channelId: string,
    recipient: string,
    message: string,
    options?: {
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      disable_web_page_preview?: boolean;
      disable_notification?: boolean;
      reply_to_message_id?: number;
      reply_markup?: any;
    },
  ): Promise<any> {
    // Adapt the parameters to match TelegramService's expected format
    const telegramMessage: TelegramMessage = {
      chat_id: recipient, // recipient is the Telegram chat ID
      text: message,
    };

    // Add optional parameters if provided
    if (options?.parse_mode) {
      telegramMessage.parse_mode = options.parse_mode;
    }
    if (options?.disable_web_page_preview !== undefined) {
      telegramMessage.disable_web_page_preview = options.disable_web_page_preview;
    }
    if (options?.disable_notification !== undefined) {
      telegramMessage.disable_notification = options.disable_notification;
    }
    if (options?.reply_to_message_id) {
      telegramMessage.reply_to_message_id = options.reply_to_message_id;
    }
    if (options?.reply_markup) {
      telegramMessage.reply_markup = options.reply_markup;
    }

    // Call the underlying TelegramService
    const result = await telegramService.sendMessage(channelId, telegramMessage);

    return {
      success: true,
      provider: 'telegram',
      messageId: result.result.message_id,
      chatId: result.result.chat.id,
      data: result,
    };
  }

  /**
   * Returns the provider type
   */
  getProviderType(): string {
    return 'telegram';
  }
}

