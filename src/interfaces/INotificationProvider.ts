/**
 * Interface for all notification providers
 * This is the Target interface in the Adapter pattern
 */
export interface INotificationProvider {
  /**
   * Sends a message through the notification provider
   * @param channelId - The channel/account ID to send from
   * @param recipient - The recipient identifier (phone number, Slack channel ID, etc.)
   * @param message - The message content
   * @param options - Optional additional parameters
   */
  send(
    channelId: string,
    recipient: string,
    message: string,
    options?: any,
  ): Promise<any>;

  /**
   * Gets the provider type
   */
  getProviderType(): string;
}
