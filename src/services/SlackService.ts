import axios from 'axios';
import Channel from '../models/Channels';
import { SlackMessage, SlackMessageResponse } from '../types/Slack';

export class SlackService {
  private readonly SLACK_API_BASE = 'https://slack.com/api';

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
   * Sends a message to a Slack channel
   */
  async sendMessage(
    channelId: string,
    message: SlackMessage,
  ): Promise<SlackMessageResponse> {
    try {
      const botToken = await this.getBotToken(channelId);

      const response = await axios.post(
        `${this.SLACK_API_BASE}/chat.postMessage`,
        message,
        {
          headers: {
            Authorization: `Bearer ${botToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      if (!response.data.ok) {
        throw new Error(`Failed to send message: ${response.data.error}`);
      }

      return response.data as SlackMessageResponse;
    } catch (error) {
      console.error(`❌ Error sending Slack message:`, error);
      throw error;
    }
  }

  /**
   * No-op for compatibility
   */
  async restoreActiveChannels(): Promise<void> {
    console.log('✅ Slack service ready (no restoration needed)');
  }
}

export const slackService = new SlackService();
