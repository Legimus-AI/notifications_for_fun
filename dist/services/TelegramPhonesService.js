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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramPhonesService = exports.TelegramPhonesService = void 0;
const axios_1 = __importDefault(require("axios"));
const Channels_1 = __importDefault(require("../models/Channels"));
class TelegramPhonesService {
    constructor() {
        this.TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
        this.CALLMEBOT_API_BASE = 'https://api.callmebot.com/start.php';
    }
    /**
     * Gets bot token from database
     */
    getBotToken(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            const channel = yield Channels_1.default.findOne({ channelId });
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }
            const config = channel.config;
            if (!config.botToken) {
                throw new Error('Bot token is required');
            }
            return config.botToken;
        });
    }
    /**
     * Gets default phone country from database
     */
    getDefaultPhoneCountry(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            const channel = yield Channels_1.default.findOne({ channelId });
            if (!channel) {
                throw new Error(`Channel ${channelId} not found`);
            }
            const config = channel.config;
            return config.defaultPhoneCountry || '+1';
        });
    }
    /**
     * Sends a message to a Telegram chat
     */
    sendMessage(channelId, message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const botToken = yield this.getBotToken(channelId);
                const response = yield axios_1.default.post(`${this.TELEGRAM_API_BASE}${botToken}/sendMessage`, message, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                });
                if (!response.data.ok) {
                    throw new Error(`Failed to send message: ${response.data.description || 'Unknown error'}`);
                }
                return response.data;
            }
            catch (error) {
                console.error(`❌ Error sending Telegram Phones message:`, error);
                if ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) {
                    throw new Error(`Telegram API error: ${error.response.data.description || error.message}`);
                }
                throw error;
            }
        });
    }
    /**
     * Initiates a phone call using CallMeBot API
     */
    initiatePhoneCall(channelId, callRequest) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const defaultCountry = yield this.getDefaultPhoneCountry(channelId);
                // Format phone number with country code if not already present
                let formattedUser = callRequest.phone;
                if (!formattedUser.startsWith('+') && !formattedUser.startsWith('@')) {
                    formattedUser = `${defaultCountry}${formattedUser.replace(/[^0-9]/g, '')}`;
                }
                // CallMeBot API format: user=[@username or phone]&text=[message]
                // Only include optional parameters if explicitly provided
                const params = new URLSearchParams({
                    user: formattedUser,
                    text: callRequest.message || 'Call from notification system',
                });
                // Add optional parameters only if provided
                if (callRequest.language) {
                    params.append('lang', callRequest.language);
                }
                if (callRequest.repeat) {
                    params.append('rpt', String(callRequest.repeat));
                }
                if (callRequest.carbonCopy) {
                    params.append('cc', callRequest.carbonCopy);
                }
                if (callRequest.timeout) {
                    params.append('timeout', String(callRequest.timeout));
                }
                const response = yield axios_1.default.get(`${this.CALLMEBOT_API_BASE}?${params.toString()}`, {
                    timeout: 30000,
                });
                // Parse CallMeBot response
                const responseText = response.data;
                if (responseText.includes('call has been queued') || responseText.includes('Starting Telegram Audio Call')) {
                    // Extract call ID if present
                    const callIdMatch = responseText.match(/\(id:(\d+)\)/);
                    const callId = callIdMatch ? callIdMatch[1] : undefined;
                    return {
                        success: true,
                        callId,
                        status: 'queued',
                        message: 'Phone call initiated and queued successfully',
                    };
                }
                else if (responseText.includes('Missed Call')) {
                    return {
                        success: true,
                        status: 'missed',
                        message: 'Call was initiated but missed by recipient',
                    };
                }
                else if (responseText.includes('Line is busy')) {
                    return {
                        success: true,
                        status: 'queued',
                        message: 'Line is busy, call queued for retry',
                    };
                }
                else if (responseText.includes('User') && responseText.includes('is in the whitelist') && !responseText.includes('Something went wrong')) {
                    return {
                        success: true,
                        status: 'initiated',
                        message: 'Call initiated successfully',
                    };
                }
                else if (responseText.includes('Two calls to the same user') && responseText.includes('within 65 seconds')) {
                    return {
                        success: false,
                        status: 'rate_limited',
                        message: 'Rate limit: Please wait 65 seconds between calls to the same user',
                    };
                }
                else {
                    return {
                        success: false,
                        status: 'failed',
                        message: responseText || 'Failed to initiate phone call',
                    };
                }
            }
            catch (error) {
                console.error(`❌ Error initiating phone call:`, error);
                return {
                    success: false,
                    status: 'error',
                    message: error.message || 'Error initiating phone call',
                };
            }
        });
    }
    /**
     * Sends a message with a call request button
     */
    sendCallRequestMessage(channelId, chatId, message, phoneNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const callMeBotMessage = {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '📞 Call Me',
                                callback_data: phoneNumber ? `call_${phoneNumber}` : 'call_request',
                            },
                        ],
                    ],
                },
            };
            return this.sendMessage(channelId, callMeBotMessage);
        });
    }
    /**
     * No-op for compatibility
     */
    restoreActiveChannels() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('✅ Telegram Phones service ready (no restoration needed)');
        });
    }
}
exports.TelegramPhonesService = TelegramPhonesService;
exports.telegramPhonesService = new TelegramPhonesService();
//# sourceMappingURL=TelegramPhonesService.js.map