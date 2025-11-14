"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationServiceFactory = void 0;
const SlackNotificationAdapter_1 = require("../adapters/SlackNotificationAdapter");
const WhatsAppNotificationAdapter_1 = require("../adapters/WhatsAppNotificationAdapter");
const TelegramNotificationAdapter_1 = require("../adapters/TelegramNotificationAdapter");
const TelegramPhonesNotificationAdapter_1 = require("../adapters/TelegramPhonesNotificationAdapter");
/**
 * Factory to create notification adapters
 * Simplified - returns adapters directly without extra wrapper
 */
class NotificationServiceFactory {
    /**
     * Creates the appropriate notification adapter based on provider type
     * @param providerType - The type of provider ('slack', 'whatsapp', etc.)
     * @returns INotificationProvider adapter
     */
    static createAdapter(providerType) {
        switch (providerType.toLowerCase()) {
            case 'slack':
                return new SlackNotificationAdapter_1.SlackNotificationAdapter();
            case 'whatsapp':
                return new WhatsAppNotificationAdapter_1.WhatsAppNotificationAdapter();
            case 'telegram':
                return new TelegramNotificationAdapter_1.TelegramNotificationAdapter();
            case 'telegram_phones':
                return new TelegramPhonesNotificationAdapter_1.TelegramPhonesNotificationAdapter();
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
    static createMultipleAdapters(providerTypes) {
        const adapters = new Map();
        for (const providerType of providerTypes) {
            adapters.set(providerType, this.createAdapter(providerType));
        }
        return adapters;
    }
}
exports.NotificationServiceFactory = NotificationServiceFactory;
//# sourceMappingURL=NotificationServiceFactory.js.map