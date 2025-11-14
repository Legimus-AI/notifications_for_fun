"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const uuid_1 = require("uuid");
const utils = __importStar(require("../helpers/utils"));
const Channels_1 = __importDefault(require("../models/Channels"));
const TelegramPhonesService_1 = require("../services/TelegramPhonesService");
const mongoose_1 = __importDefault(require("mongoose"));
class TelegramPhonesController {
    constructor() {
        /**
         * Creates a new Telegram Phones channel
         */
        this.createChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { name, botToken, callMeBotToken, defaultPhoneCountry } = req.body;
                if (!name) {
                    return utils.handleError(res, utils.buildErrObject(400, 'NAME_REQUIRED'));
                }
                if (!botToken) {
                    return utils.handleError(res, utils.buildErrObject(400, 'BOT_TOKEN_REQUIRED'));
                }
                if (!callMeBotToken) {
                    return utils.handleError(res, utils.buildErrObject(400, 'CALLMEBOT_TOKEN_REQUIRED'));
                }
                const channelId = (0, uuid_1.v4)();
                const channel = new Channels_1.default({
                    channelId,
                    ownerApiKeyId: new mongoose_1.default.Types.ObjectId(),
                    type: 'telegram_phones',
                    name,
                    config: {
                        botToken,
                        callMeBotToken,
                        defaultPhoneCountry: defaultPhoneCountry || '+1'
                    },
                    status: 'active',
                });
                yield channel.save();
                res.status(201).json({
                    ok: true,
                    payload: {
                        channelId,
                        name,
                        type: 'telegram_phones',
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Sends a message through Telegram Phones
         */
        this.sendMessage = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { chat_id, text, parse_mode, disable_web_page_preview, disable_notification, reply_to_message_id, reply_markup, } = req.body;
                if (!chat_id) {
                    return utils.handleError(res, utils.buildErrObject(400, 'CHAT_ID_REQUIRED'));
                }
                if (!text) {
                    return utils.handleError(res, utils.buildErrObject(400, 'TEXT_REQUIRED'));
                }
                const message = {
                    chat_id,
                    text,
                    parse_mode,
                    disable_web_page_preview,
                    disable_notification,
                    reply_to_message_id,
                    reply_markup,
                };
                const result = yield TelegramPhonesService_1.telegramPhonesService.sendMessage(channelId, message);
                res.status(200).json({
                    ok: true,
                    message: 'Message sent successfully',
                    payload: {
                        message_id: result.result.message_id,
                        chat_id: result.result.chat.id,
                        date: result.result.date,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Initiates a phone call using CallMeBot
         */
        this.initiateCall = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { phone, message, language } = req.body;
                if (!phone) {
                    return utils.handleError(res, utils.buildErrObject(400, 'PHONE_NUMBER_REQUIRED'));
                }
                const result = yield TelegramPhonesService_1.telegramPhonesService.initiatePhoneCall(channelId, {
                    phone,
                    message,
                    language,
                });
                console.log("phone callmebot result: ", result);
                res.status(200).json({
                    ok: result.success,
                    message: result.success ? 'Phone call initiated successfully' : 'Failed to initiate phone call',
                    payload: result,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Sends a message with a call request button
         */
        this.sendCallRequest = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { chat_id, message, phone_number } = req.body;
                if (!chat_id) {
                    return utils.handleError(res, utils.buildErrObject(400, 'CHAT_ID_REQUIRED'));
                }
                if (!message) {
                    return utils.handleError(res, utils.buildErrObject(400, 'MESSAGE_REQUIRED'));
                }
                const result = yield TelegramPhonesService_1.telegramPhonesService.sendCallRequestMessage(channelId, chat_id, message, phone_number);
                res.status(200).json({
                    ok: true,
                    message: 'Call request message sent successfully',
                    payload: {
                        message_id: result.result.message_id,
                        chat_id: result.result.chat.id,
                        date: result.result.date,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Updates a Telegram Phones channel configuration
         */
        this.updateChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { name, botToken, callMeBotToken, defaultPhoneCountry } = req.body;
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                if (channel.type !== 'telegram_phones') {
                    return utils.handleError(res, utils.buildErrObject(400, 'INVALID_CHANNEL_TYPE'));
                }
                // Update channel properties
                if (name)
                    channel.name = name;
                const config = channel.config;
                if (botToken)
                    config.botToken = botToken;
                if (callMeBotToken)
                    config.callMeBotToken = callMeBotToken;
                if (defaultPhoneCountry)
                    config.defaultPhoneCountry = defaultPhoneCountry;
                yield channel.save();
                res.status(200).json({
                    ok: true,
                    message: 'Telegram Phones channel updated successfully',
                    payload: {
                        channelId: channel.channelId,
                        name: channel.name,
                        type: channel.type,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Deletes a Telegram Phones channel
         */
        this.deleteChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                if (channel.type !== 'telegram_phones') {
                    return utils.handleError(res, utils.buildErrObject(400, 'INVALID_CHANNEL_TYPE'));
                }
                yield Channels_1.default.deleteOne({ channelId });
                res.status(200).json({
                    ok: true,
                    message: 'Telegram Phones channel deleted successfully',
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Lists all Telegram Phones channels
         */
        this.listChannels = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const channels = yield Channels_1.default.find({ type: 'telegram_phones' });
                const channelsList = channels.map((channel) => {
                    const config = channel.config;
                    return {
                        channelId: channel.channelId,
                        name: channel.name,
                        createdAt: channel.createdAt,
                        config: {
                            hasBotToken: !!config.botToken,
                            hasCallMeBotToken: !!config.callMeBotToken,
                            defaultPhoneCountry: config.defaultPhoneCountry,
                        },
                    };
                });
                res.status(200).json({
                    ok: true,
                    payload: channelsList,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Gets a specific Telegram Phones channel details
         */
        this.getChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const channel = yield Channels_1.default.findOne({ channelId, type: 'telegram_phones' });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                const config = channel.config;
                res.status(200).json({
                    ok: true,
                    payload: {
                        channelId: channel.channelId,
                        name: channel.name,
                        type: channel.type,
                        status: channel.status,
                        isActive: channel.isActive,
                        createdAt: channel.createdAt,
                        updatedAt: channel.updatedAt,
                        config: {
                            hasBotToken: !!config.botToken,
                            hasCallMeBotToken: !!config.callMeBotToken,
                            defaultPhoneCountry: config.defaultPhoneCountry,
                        },
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
    }
}
const telegramPhonesController = new TelegramPhonesController();
exports.default = telegramPhonesController;
//# sourceMappingURL=telegramPhones.controller.js.map