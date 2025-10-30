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
exports.slackService = exports.SlackService = void 0;
const axios_1 = __importDefault(require("axios"));
const Channels_1 = __importDefault(require("../models/Channels"));
class SlackService {
    constructor() {
        this.SLACK_API_BASE = 'https://slack.com/api';
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
     * Sends a message to a Slack channel
     */
    sendMessage(channelId, message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const botToken = yield this.getBotToken(channelId);
                const response = yield axios_1.default.post(`${this.SLACK_API_BASE}/chat.postMessage`, message, {
                    headers: {
                        Authorization: `Bearer ${botToken}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                });
                if (!response.data.ok) {
                    throw new Error(`Failed to send message: ${response.data.error}`);
                }
                return response.data;
            }
            catch (error) {
                console.error(`❌ Error sending Slack message:`, error);
                throw error;
            }
        });
    }
    /**
     * No-op for compatibility
     */
    restoreActiveChannels() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('✅ Slack service ready (no restoration needed)');
        });
    }
}
exports.SlackService = SlackService;
exports.slackService = new SlackService();
//# sourceMappingURL=SlackService.js.map