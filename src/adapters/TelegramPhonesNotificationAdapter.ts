import { INotificationProvider } from '../interfaces/INotificationProvider';
import { telegramPhonesService } from '../services/TelegramPhonesService';
import { TelegramPhonesMessage } from '../types/TelegramPhones';

/**
 * Telegram Phones Adapter - Adapts TelegramPhonesService to INotificationProvider interface
 * This adapter handles Telegram messages with phone call functionality via CallMeBot
 */
export class TelegramPhonesNotificationAdapter implements INotificationProvider {
  /**
   * Sends a message through Telegram Phones
   * Supports additional options for phone call functionality
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
      // Phone call specific options
      initiate_call?: boolean;
      phone_number?: string;
      call_message?: string;
      call_language?: string;
    },
  ): Promise<any> {
    try {
      // If phone call is requested, initiate the call first
      if (options?.initiate_call && options.phone_number) {
        const callResult = await telegramPhonesService.initiatePhoneCall(channelId, {
          phone: options.phone_number,
          message: options.call_message,
          language: options.call_language,
        });

        if (!callResult.success) {
          throw new Error(`Failed to initiate phone call: ${callResult.message}`);
        }
      }

      // Adapt the parameters to match TelegramPhonesService's expected format
      const telegramPhonesMessage: TelegramPhonesMessage = {
        chat_id: recipient, // recipient is the Telegram chat ID
        text: message,
      };

      // Add optional parameters if provided
      if (options?.parse_mode) {
        telegramPhonesMessage.parse_mode = options.parse_mode;
      }
      if (options?.disable_web_page_preview !== undefined) {
        telegramPhonesMessage.disable_web_page_preview = options.disable_web_page_preview;
      }
      if (options?.disable_notification !== undefined) {
        telegramPhonesMessage.disable_notification = options.disable_notification;
      }
      if (options?.reply_to_message_id) {
        telegramPhonesMessage.reply_to_message_id = options.reply_to_message_id;
      }
      if (options?.reply_markup) {
        telegramPhonesMessage.reply_markup = options.reply_markup;
      }

      // Call the underlying TelegramPhonesService
      const result = await telegramPhonesService.sendMessage(channelId, telegramPhonesMessage);

      return {
        success: true,
        provider: 'telegram_phones',
        messageId: result.result.message_id,
        chatId: result.result.chat.id,
        data: result,
        callInitiated: options?.initiate_call || false,
      };
    } catch (error: any) {
      console.error(`❌ Error in TelegramPhonesNotificationAdapter:`, error);
      return {
        success: false,
        provider: 'telegram_phones',
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Sends a message with a call request button
   */
  async sendCallRequest(
    channelId: string,
    recipient: string,
    message: string,
    phoneNumber?: string,
  ): Promise<any> {
    try {
      const result = await telegramPhonesService.sendCallRequestMessage(
        channelId,
        recipient,
        message,
        phoneNumber,
      );

      return {
        success: true,
        provider: 'telegram_phones',
        messageId: result.result.message_id,
        chatId: result.result.chat.id,
        data: result,
        callRequest: true,
      };
    } catch (error: any) {
      console.error(`❌ Error sending call request:`, error);
      return {
        success: false,
        provider: 'telegram_phones',
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Initiates a phone call without sending a Telegram message
   */
  async initiateCall(
    channelId: string,
    phoneNumber: string,
    message?: string,
    language?: string,
  ): Promise<any> {
    try {
      const result = await telegramPhonesService.initiatePhoneCall(channelId, {
        phone: phoneNumber,
        message,
        language,
      });

      return {
        success: result.success,
        provider: 'telegram_phones',
        callId: result.callId,
        status: result.status,
        message: result.message,
        data: result,
      };
    } catch (error: any) {
      console.error(`❌ Error initiating phone call:`, error);
      return {
        success: false,
        provider: 'telegram_phones',
        error: error.message,
        data: null,
      };
    }
  }

  /**
   * Returns the provider type
   */
  getProviderType(): string {
    return 'telegram_phones';
  }
}
