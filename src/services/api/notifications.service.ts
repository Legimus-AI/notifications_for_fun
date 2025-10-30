import { NotificationServiceFactory } from '../../factories/NotificationServiceFactory';
import { INotificationProvider } from '../../interfaces/INotificationProvider';

/**
 * Notifications Service - Internal service for sending notifications
 * Uses adapters through the factory to send messages across different providers
 */
export class NotificationsService {
  /**
   * Sends a notification through the specified provider
   */
  async sendNotification(
    provider: string,
    channelId: string,
    recipient: string,
    message: string,
    options?: any,
  ): Promise<any> {
    // Create the appropriate adapter using the factory
    const adapter: INotificationProvider = NotificationServiceFactory.createAdapter(provider);

    // Send the notification through the adapter
    const result = await adapter.send(channelId, recipient, message, options);

    return result;
  }

  /**
   * Sends notifications to multiple providers
   */
  async sendMultipleNotifications(
    notifications: Array<{
      provider: string;
      channelId: string;
      recipient: string;
      message: string;
      options?: any;
    }>,
  ): Promise<
    Array<{
      provider: string;
      recipient: string;
      success: boolean;
      data: any;
      error: string | null;
    }>
  > {
    // Send all notifications in parallel
    const results = await Promise.allSettled(
      notifications.map(async (notification) => {
        const { provider, channelId, recipient, message, options } = notification;

        return this.sendNotification(provider, channelId, recipient, message, options);
      }),
    );

    // Format results
    const formattedResults = results.map((result, index) => ({
      provider: notifications[index].provider,
      recipient: notifications[index].recipient,
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? (result.reason as Error)?.message : null,
    }));

    return formattedResults;
  }
}

export const notificationsService = new NotificationsService();
