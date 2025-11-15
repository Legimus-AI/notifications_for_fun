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
exports.sendCallMeBotNotification = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Send WhatsApp notification using CallMeBot API
 * @param phone - Phone number with country code (e.g., 51983724476)
 * @param message - Message text to send
 * @param apiKey - CallMeBot API key
 * @returns Promise<boolean> - true if successful, false otherwise
 */
const sendCallMeBotNotification = (phone, message, apiKey) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Build URL manually to avoid double encoding
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apiKey}`;
        const response = yield axios_1.default.get(url, {
            timeout: 10000, // 10 seconds timeout
        });
        if (response.status === 200) {
            console.log(`✅ CallMeBot notification sent to ${phone}`);
            return true;
        }
        else {
            console.error(`❌ CallMeBot notification failed with status: ${response.status}`);
            console.error(`❌ CallMeBot notification failed with status: ${response.data}`);
            return false;
        }
    }
    catch (error) {
        console.error('❌ Error sending CallMeBot notification:', error);
        return false;
    }
});
exports.sendCallMeBotNotification = sendCallMeBotNotification;
//# sourceMappingURL=callMeBotWhatsAppNotifications.js.map