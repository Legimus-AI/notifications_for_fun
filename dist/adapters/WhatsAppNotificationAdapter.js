"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppNotificationAdapter = void 0;
const WhatsAppService_1 = require("../services/WhatsAppService");
/**
 * WhatsApp Adapter - Adapts WhatsAppService to INotificationProvider interface
 * This is an Adapter in the Adapter pattern
 */
class WhatsAppNotificationAdapter {
    /**
     * Sends a message through WhatsApp
     */
    send(channelId, recipient, message, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Adapt the parameters to match WhatsAppService's expected format
            const whatsappMessage = {
                to: recipient, // recipient is the phone number
                type: 'text',
                text: message,
            };
            // Add media if provided
            if (options === null || options === void 0 ? void 0 : options.media) {
                whatsappMessage.type = options.media.type;
                whatsappMessage.media = options.media;
            }
            // Add buttons if provided
            if (options === null || options === void 0 ? void 0 : options.buttons) {
                whatsappMessage.buttons = options.buttons;
            }
            // Add context (for replies) if provided
            if (options === null || options === void 0 ? void 0 : options.context) {
                whatsappMessage.context = options.context;
            }
            // Call the underlying WhatsAppService
            const result = yield WhatsAppService_1.whatsAppService.sendMessageFromApi(channelId, whatsappMessage);
            return {
                success: true,
                provider: 'whatsapp',
                messageId: (_a = result.key) === null || _a === void 0 ? void 0 : _a.id,
                recipient: recipient,
                data: result,
            };
        });
    }
    /**
     * Returns the provider type
     */
    getProviderType() {
        return 'whatsapp';
    }
}
exports.WhatsAppNotificationAdapter = WhatsAppNotificationAdapter;
//# sourceMappingURL=WhatsAppNotificationAdapter.js.map