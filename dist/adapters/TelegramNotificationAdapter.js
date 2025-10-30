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
exports.TelegramNotificationAdapter = void 0;
const TelegramService_1 = require("../services/TelegramService");
/**
 * Telegram Adapter - Adapts TelegramService to INotificationProvider interface
 * This is an Adapter in the Adapter pattern
 */
class TelegramNotificationAdapter {
    /**
     * Sends a message through Telegram
     */
    send(channelId, recipient, message, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Adapt the parameters to match TelegramService's expected format
            const telegramMessage = {
                chat_id: recipient,
                text: message,
            };
            // Add optional parameters if provided
            if (options === null || options === void 0 ? void 0 : options.parse_mode) {
                telegramMessage.parse_mode = options.parse_mode;
            }
            if ((options === null || options === void 0 ? void 0 : options.disable_web_page_preview) !== undefined) {
                telegramMessage.disable_web_page_preview = options.disable_web_page_preview;
            }
            if ((options === null || options === void 0 ? void 0 : options.disable_notification) !== undefined) {
                telegramMessage.disable_notification = options.disable_notification;
            }
            if (options === null || options === void 0 ? void 0 : options.reply_to_message_id) {
                telegramMessage.reply_to_message_id = options.reply_to_message_id;
            }
            if (options === null || options === void 0 ? void 0 : options.reply_markup) {
                telegramMessage.reply_markup = options.reply_markup;
            }
            // Call the underlying TelegramService
            const result = yield TelegramService_1.telegramService.sendMessage(channelId, telegramMessage);
            return {
                success: true,
                provider: 'telegram',
                messageId: result.result.message_id,
                chatId: result.result.chat.id,
                data: result,
            };
        });
    }
    /**
     * Returns the provider type
     */
    getProviderType() {
        return 'telegram';
    }
}
exports.TelegramNotificationAdapter = TelegramNotificationAdapter;
//# sourceMappingURL=TelegramNotificationAdapter.js.map