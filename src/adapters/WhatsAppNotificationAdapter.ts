import { INotificationProvider } from '../interfaces/INotificationProvider';
import { whatsAppService } from '../services/WhatsAppService';

/**
 * WhatsApp Adapter - Adapts WhatsAppService to INotificationProvider interface
 * This is an Adapter in the Adapter pattern
 */
export class WhatsAppNotificationAdapter implements INotificationProvider {
  /**
   * Sends a message through WhatsApp
   */
  async send(
    channelId: string,
    recipient: string,
    message: string,
    options?: {
      media?: {
        type: 'image' | 'video' | 'audio' | 'document';
        url?: string;
        buffer?: Buffer;
        caption?: string;
        filename?: string;
      };
      buttons?: any[];
      context?: { messageId: string };
    },
  ): Promise<any> {
    // Adapt the parameters to match WhatsAppService's expected format
    const whatsappMessage: any = {
      to: recipient, // recipient is the phone number
      type: 'text',
      text: message,
    };

    // Add media if provided
    if (options?.media) {
      whatsappMessage.type = options.media.type;
      whatsappMessage.media = options.media;
    }

    // Add buttons if provided
    if (options?.buttons) {
      whatsappMessage.buttons = options.buttons;
    }

    // Add context (for replies) if provided
    if (options?.context) {
      whatsappMessage.context = options.context;
    }

    // Call the underlying WhatsAppService
    const result = await whatsAppService.sendMessageFromApi(channelId, whatsappMessage);

    return {
      success: true,
      provider: 'whatsapp',
      messageId: result.key?.id,
      recipient: recipient,
      data: result,
    };
  }

  /**
   * Returns the provider type
   */
  getProviderType(): string {
    return 'whatsapp';
  }
}
