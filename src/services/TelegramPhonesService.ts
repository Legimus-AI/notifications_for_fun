import axios from 'axios';
import Channel from '../models/Channels';
import {
  TelegramPhonesMessage,
  TelegramPhonesMessageResponse,
  TelegramPhonesCallRequest,
  TelegramPhonesCallResponse,
} from '../types/TelegramPhones';

export class TelegramPhonesService {
  private readonly TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
  private readonly CALLMEBOT_API_BASE = 'https://api.callmebot.com/start.php';

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
   * Gets default phone country from database
   */
  private async getDefaultPhoneCountry(channelId: string): Promise<string> {
    const channel = await Channel.findOne({ channelId });
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const config = channel.config as any;
    return config.defaultPhoneCountry || '+1';
  }

  /**
   * Sends a message to a Telegram chat
   */
  async sendMessage(
    channelId: string,
    message: TelegramPhonesMessage,
  ): Promise<TelegramPhonesMessageResponse> {
    try {
      const botToken = await this.getBotToken(channelId);

      const response = await axios.post(
        `${this.TELEGRAM_API_BASE}${botToken}/sendMessage`,
        message,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      if (!response.data.ok) {
        throw new Error(
          `Failed to send message: ${response.data.description || 'Unknown error'}`,
        );
      }

      return response.data as TelegramPhonesMessageResponse;
    } catch (error: any) {
      console.error(`❌ Error sending Telegram Phones message:`, error);
      if (error.response?.data) {
        throw new Error(
          `Telegram API error: ${error.response.data.description || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Initiates a phone call using CallMeBot API
   */
  async initiatePhoneCall(
    channelId: string,
    callRequest: TelegramPhonesCallRequest,
  ): Promise<TelegramPhonesCallResponse> {
    try {
      const defaultCountry = await this.getDefaultPhoneCountry(channelId);

      // Format phone number with country code if not already present
      let formattedUser = callRequest.phone;
      if (!formattedUser.startsWith('+') && !formattedUser.startsWith('@')) {
        formattedUser = `${defaultCountry}${formattedUser.replace(/[^0-9]/g, '')}`;
      }

      // CallMeBot uses user parameter (either @username or phone number with +)
      const params = new URLSearchParams({
        user: formattedUser, // Can be @username or phone number with +
        text: callRequest.message || 'Call from notification system',
      });

      // Add language parameter if provided
      if (callRequest.language) {
        params.append('lang', callRequest.language);
      }

      const response = await axios.get(
        `${this.CALLMEBOT_API_BASE}?${params.toString()}`,
        {
          timeout: 30000,
        },
      );

      // Parse CallMeBot response
      const responseText = response.data;
      if (responseText.includes('call has been queued') || responseText.includes('Starting Telegram Audio Call')) {
        // Extract call ID if present
        const callIdMatch = responseText.match(/\(id:(\d+)\)/);
        const callId = callIdMatch ? callIdMatch[1] : undefined;

        return {
          success: true,
          callId,
          status: 'queued',
          message: 'Phone call initiated and queued successfully',
        };
      } else if (responseText.includes('Missed Call')) {
        return {
          success: true,
          status: 'missed',
          message: 'Call was initiated but missed by recipient',
        };
      } else if (responseText.includes('Line is busy')) {
        return {
          success: true,
          status: 'queued',
          message: 'Line is busy, call queued for retry',
        };
      } else if (responseText.includes('User') && responseText.includes('is in the whitelist')) {
        return {
          success: true,
          status: 'initiated',
          message: 'Call initiated successfully',
        };
      } else {
        return {
          success: false,
          status: 'failed',
          message: responseText || 'Failed to initiate phone call',
        };
      }
    } catch (error: any) {
      console.error(`❌ Error initiating phone call:`, error);
      return {
        success: false,
        status: 'error',
        message: error.message || 'Error initiating phone call',
      };
    }
  }

  /**
   * Sends a message with a call request button
   */
  async sendCallRequestMessage(
    channelId: string,
    chatId: string | number,
    message: string,
    phoneNumber?: string,
  ): Promise<TelegramPhonesMessageResponse> {
    const callMeBotMessage: TelegramPhonesMessage = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📞 Call Me',
              callback_data: phoneNumber ? `call_${phoneNumber}` : 'call_request',
            },
          ],
        ],
      },
    };

    return this.sendMessage(channelId, callMeBotMessage);
  }

  /**
   * No-op for compatibility
   */
  async restoreActiveChannels(): Promise<void> {
    console.log('✅ Telegram Phones service ready (no restoration needed)');
  }
}

export const telegramPhonesService = new TelegramPhonesService();
