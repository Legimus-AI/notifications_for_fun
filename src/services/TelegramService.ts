import axios from 'axios';
import Channel from '../models/Channels';
import {
  TelegramMessage,
  TelegramMessageResponse,
} from '../types/Telegram';

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
   * Sends a message to a Telegram chat
   */
  async sendMessage(
    channelId: string,
    message: TelegramMessage,
  ): Promise<TelegramMessageResponse> {
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

      return response.data as TelegramMessageResponse;
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
   * No-op for compatibility
   */
  async restoreActiveChannels(): Promise<void> {
    console.log('✅ Telegram service ready (no restoration needed)');
  }
}

export const telegramService = new TelegramService();

