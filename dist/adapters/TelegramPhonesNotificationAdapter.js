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
exports.TelegramPhonesNotificationAdapter = void 0;
const TelegramPhonesService_1 = require("../services/TelegramPhonesService");
/**
 * Telegram Phones Adapter - Adapts TelegramPhonesService to INotificationProvider interface
 * This adapter handles Telegram messages with phone call functionality via CallMeBot
 */
class TelegramPhonesNotificationAdapter {
    /**
     * Sends a message through Telegram Phones
     * Supports additional options for phone call functionality
     */
    send(channelId, recipient, message, options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // If phone call is requested, initiate the call first
                if ((options === null || options === void 0 ? void 0 : options.initiate_call) && options.phone_number) {
                    const callResult = yield TelegramPhonesService_1.telegramPhonesService.initiatePhoneCall(channelId, {
                        phone: options.phone_number,
                        message: options.call_message,
                        language: options.call_language,
                    });
                    if (!callResult.success) {
                        throw new Error(`Failed to initiate phone call: ${callResult.message}`);
                    }
                }
                // Adapt the parameters to match TelegramPhonesService's expected format
                const telegramPhonesMessage = {
                    chat_id: recipient, // recipient is the Telegram chat ID
                    text: message,
                };
                // Add optional parameters if provided
                if (options === null || options === void 0 ? void 0 : options.parse_mode) {
                    telegramPhonesMessage.parse_mode = options.parse_mode;
                }
                if ((options === null || options === void 0 ? void 0 : options.disable_web_page_preview) !== undefined) {
                    telegramPhonesMessage.disable_web_page_preview = options.disable_web_page_preview;
                }
                if ((options === null || options === void 0 ? void 0 : options.disable_notification) !== undefined) {
                    telegramPhonesMessage.disable_notification = options.disable_notification;
                }
                if (options === null || options === void 0 ? void 0 : options.reply_to_message_id) {
                    telegramPhonesMessage.reply_to_message_id = options.reply_to_message_id;
                }
                if (options === null || options === void 0 ? void 0 : options.reply_markup) {
                    telegramPhonesMessage.reply_markup = options.reply_markup;
                }
                // Call the underlying TelegramPhonesService
                const result = yield TelegramPhonesService_1.telegramPhonesService.sendMessage(channelId, telegramPhonesMessage);
                return {
                    success: true,
                    provider: 'telegram_phones',
                    messageId: result.result.message_id,
                    chatId: result.result.chat.id,
                    data: result,
                    callInitiated: (options === null || options === void 0 ? void 0 : options.initiate_call) || false,
                };
            }
            catch (error) {
                console.error(`❌ Error in TelegramPhonesNotificationAdapter:`, error);
                return {
                    success: false,
                    provider: 'telegram_phones',
                    error: error.message,
                    data: null,
                };
            }
        });
    }
    /**
     * Sends a message with a call request button
     */
    sendCallRequest(channelId, recipient, message, phoneNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield TelegramPhonesService_1.telegramPhonesService.sendCallRequestMessage(channelId, recipient, message, phoneNumber);
                return {
                    success: true,
                    provider: 'telegram_phones',
                    messageId: result.result.message_id,
                    chatId: result.result.chat.id,
                    data: result,
                    callRequest: true,
                };
            }
            catch (error) {
                console.error(`❌ Error sending call request:`, error);
                return {
                    success: false,
                    provider: 'telegram_phones',
                    error: error.message,
                    data: null,
                };
            }
        });
    }
    /**
     * Initiates a phone call without sending a Telegram message
     */
    initiateCall(channelId, phoneNumber, message, language) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = yield TelegramPhonesService_1.telegramPhonesService.initiatePhoneCall(channelId, {
                    phone: phoneNumber,
                    message,
                    language,
                });
                return {
                    success: result.success,
                    provider: 'telegram_phones',
                    callId: result.callId,
                    status: result.status,
                    message: result.message,
                    data: result,
                };
            }
            catch (error) {
                console.error(`❌ Error initiating phone call:`, error);
                return {
                    success: false,
                    provider: 'telegram_phones',
                    error: error.message,
                    data: null,
                };
            }
        });
    }
    /**
     * Returns the provider type
     */
    getProviderType() {
        return 'telegram_phones';
    }
}
exports.TelegramPhonesNotificationAdapter = TelegramPhonesNotificationAdapter;
//# sourceMappingURL=TelegramPhonesNotificationAdapter.js.map