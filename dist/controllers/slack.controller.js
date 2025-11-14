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
const SlackService_1 = require("../services/SlackService");
const mongoose_1 = __importDefault(require("mongoose"));
class SlackController {
    constructor() {
        /**
         * Creates a new Slack channel
         */
        this.createChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { name, botToken } = req.body;
                if (!name) {
                    return utils.handleError(res, utils.buildErrObject(400, 'NAME_REQUIRED'));
                }
                if (!botToken) {
                    return utils.handleError(res, utils.buildErrObject(400, 'BOT_TOKEN_REQUIRED'));
                }
                const channelId = (0, uuid_1.v4)();
                const channel = new Channels_1.default({
                    channelId,
                    ownerApiKeyId: new mongoose_1.default.Types.ObjectId(),
                    type: 'slack',
                    name,
                    config: { botToken },
                    status: 'active',
                });
                yield channel.save();
                res.status(201).json({
                    ok: true,
                    payload: {
                        channelId,
                        name,
                        type: 'slack',
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Sends a message through Slack
         */
        this.sendMessage = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { channel, text, blocks } = req.body;
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(400, 'SLACK_CHANNEL_REQUIRED'));
                }
                if (!text && !blocks) {
                    return utils.handleError(res, utils.buildErrObject(400, 'TEXT_OR_BLOCKS_REQUIRED'));
                }
                const result = yield SlackService_1.slackService.sendMessage(channelId, {
                    channel,
                    text,
                    blocks,
                });
                res.status(200).json({
                    ok: true,
                    message: 'Message sent successfully',
                    payload: {
                        channel: result.channel,
                        ts: result.ts,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Deletes a Slack channel
         */
        this.deleteChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                yield Channels_1.default.deleteOne({ channelId });
                res.status(200).json({
                    ok: true,
                    message: 'Slack channel deleted successfully',
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Lists all Slack channels
         */
        this.listChannels = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const channels = yield Channels_1.default.find({ type: 'slack' });
                const channelsList = channels.map((channel) => ({
                    channelId: channel.channelId,
                    name: channel.name,
                    createdAt: channel.createdAt,
                }));
                res.status(200).json({
                    ok: true,
                    payload: channelsList,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
    }
}
const slackController = new SlackController();
exports.default = slackController;
//# sourceMappingURL=slack.controller.js.map