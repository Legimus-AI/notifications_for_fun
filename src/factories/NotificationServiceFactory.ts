import { SlackNotificationAdapter } from '../adapters/SlackNotificationAdapter';
import { WhatsAppNotificationAdapter } from '../adapters/WhatsAppNotificationAdapter';
import { TelegramNotificationAdapter } from '../adapters/TelegramNotificationAdapter';
import { TelegramPhonesNotificationAdapter } from '../adapters/TelegramPhonesNotificationAdapter';
import { INotificationProvider } from '../interfaces/INotificationProvider';

/**
 * Factory to create notification adapters
 * Simplified - returns adapters directly without extra wrapper
 */
export class NotificationServiceFactory {
  /**
   * Creates the appropriate notification adapter based on provider type
   * @param providerType - The type of provider ('slack', 'whatsapp', etc.)
   * @returns INotificationProvider adapter
   */
  static createAdapter(providerType: string): INotificationProvider {
    switch (providerType.toLowerCase()) {
      case 'slack':
        return new SlackNotificationAdapter();
      case 'whatsapp':
        return new WhatsAppNotificationAdapter();
      case 'telegram':
        return new TelegramNotificationAdapter();
      case 'telegram_phones':
        return new TelegramPhonesNotificationAdapter();
      // Easy to add more providers here
      // case 'email':
      //   return new EmailNotificationAdapter();
      // case 'sms':
      //   return new SMSNotificationAdapter();
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }

  /**
   * Creates multiple adapters for different providers
   * @param providerTypes - Array of provider types
   * @returns Map of provider type to adapter
   */
  static createMultipleAdapters(
    providerTypes: string[],
  ): Map<string, INotificationProvider> {
    const adapters = new Map<string, INotificationProvider>();

    for (const providerType of providerTypes) {
      adapters.set(providerType, this.createAdapter(providerType));
    }

    return adapters;
  }
}
