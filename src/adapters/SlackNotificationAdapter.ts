import { INotificationProvider } from '../interfaces/INotificationProvider';
import { slackService } from '../services/SlackService';

/**
 * Slack Adapter - Adapts SlackService to INotificationProvider interface
 * This is an Adapter in the Adapter pattern
 */
export class SlackNotificationAdapter implements INotificationProvider {
  /**
   * Sends a message through Slack
   */
  async send(
    channelId: string,
    recipient: string,
    message: string,
    options?: {
      blocks?: any[];
      attachments?: any[];
      thread_ts?: string;
    },
  ): Promise<any> {
    // Adapt the parameters to match SlackService's expected format
    const slackMessage: any = {
      channel: recipient, // recipient is the Slack channel ID
      text: message,
    };

    // Add optional parameters if provided
    if (options?.blocks) {
      slackMessage.blocks = options.blocks;
    }
    if (options?.attachments) {
      slackMessage.attachments = options.attachments;
    }
    if (options?.thread_ts) {
      slackMessage.thread_ts = options.thread_ts;
    }

    // Call the underlying SlackService
    const result = await slackService.sendMessage(channelId, slackMessage);

    return {
      success: true,
      provider: 'slack',
      messageId: result.ts,
      channel: result.channel,
      data: result,
    };
  }

  /**
   * Returns the provider type
   */
  getProviderType(): string {
    return 'slack';
  }
}
