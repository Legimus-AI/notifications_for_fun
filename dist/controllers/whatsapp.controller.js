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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const WhatsAppService_1 = require("../services/WhatsAppService");
const mongoose_1 = __importDefault(require("mongoose"));
class WhatsAppController {
    constructor() {
        /**
         * Creates a new WhatsApp channel
         */
        this.createChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { name, phoneNumber } = req.body;
                const channelId = (0, uuid_1.v4)();
                // Create channel in database
                const channel = new Channels_1.default({
                    channelId,
                    ownerApiKeyId: new mongoose_1.default.Types.ObjectId(),
                    type: 'whatsapp_automated',
                    name,
                    config: {
                        phoneNumber,
                    },
                    status: 'inactive',
                });
                yield channel.save();
                res.status(201).json({
                    ok: true,
                    payload: {
                        channelId,
                        name,
                        type: 'whatsapp_automated',
                        status: 'inactive',
                        phoneNumber,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Connects a WhatsApp channel (starts the Baileys connection)
         */
        this.connectChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { phoneNumber } = req.body; // Optional for pairing code
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                    return;
                }
                // Check if already connected
                const currentStatus = WhatsAppService_1.whatsAppService.getChannelStatus(channelId);
                if (currentStatus === 'active' || currentStatus === 'connecting') {
                    res.status(200).json({
                        ok: true,
                        message: `Channel is already ${currentStatus}`,
                        status: currentStatus,
                    });
                    return;
                }
                // Start connection
                yield WhatsAppService_1.whatsAppService.connectChannel(channelId, phoneNumber);
                res.status(200).json({
                    ok: true,
                    message: 'Connection initiated',
                    channelId,
                    status: 'connecting',
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Disconnects a WhatsApp channel
         */
        this.disconnectChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Disconnect
                yield WhatsAppService_1.whatsAppService.disconnectChannel(channelId);
                res.status(200).json({
                    ok: true,
                    message: 'Channel disconnected',
                    channelId,
                    status: 'inactive',
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Gets channel status
         */
        this.getChannelStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Get status from memory first, fallback to database
                let status = WhatsAppService_1.whatsAppService.getChannelStatus(channelId);
                if (status === 'inactive' && channel.status !== 'inactive') {
                    // Use database status if memory shows inactive but DB shows different status
                    status = channel.status;
                }
                res.status(200).json({
                    ok: true,
                    payload: {
                        channelId,
                        name: channel.name,
                        status,
                        lastStatusUpdate: channel.lastStatusUpdate,
                        isActive: channel.isActive,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Sends a text message through WhatsApp
         */
        this.sendMessage = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { to, message, type = 'text' } = req.body;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Check if channel is active
                const status = WhatsAppService_1.whatsAppService.getChannelStatus(channelId);
                if (status !== 'active') {
                    return utils.handleError(res, utils.buildErrObject(400, 'CHANNEL_NOT_ACTIVE'));
                }
                let result;
                if (type === 'text') {
                    result = yield WhatsAppService_1.whatsAppService.sendTextMessage(channelId, to, message);
                }
                else {
                    return utils.handleError(res, utils.buildErrObject(400, 'UNSUPPORTED_MESSAGE_TYPE'));
                }
                res.status(200).json({
                    ok: true,
                    message: 'Message sent',
                    payload: {
                        messageId: result.key.id,
                        to,
                        type,
                        status: 'sent',
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Sends a media message through WhatsApp
         */
        this.sendMediaMessage = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { to, mediaType, mediaUrl, caption } = req.body;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Check if channel is active
                const status = WhatsAppService_1.whatsAppService.getChannelStatus(channelId);
                if (status !== 'active') {
                    return utils.handleError(res, utils.buildErrObject(400, 'CHANNEL_NOT_ACTIVE'));
                }
                // For now, we'll accept a media URL and fetch it
                // In production, you might want to handle file uploads differently
                const result = yield WhatsAppService_1.whatsAppService.sendMediaMessage(channelId, to, mediaType, mediaUrl, // This should be a Buffer or URL
                caption);
                res.status(200).json({
                    ok: true,
                    message: 'Media message sent',
                    payload: {
                        messageId: result.key.id,
                        to,
                        mediaType,
                        status: 'sent',
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Lists all WhatsApp channels
         */
        this.listChannels = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const channels = yield Channels_1.default.find({
                    type: 'whatsapp_automated',
                });
                const channelsWithStatus = channels.map((channel) => {
                    var _a;
                    // Get status from memory first, fallback to database
                    let status = WhatsAppService_1.whatsAppService.getChannelStatus(channel.channelId);
                    if (status === 'inactive' && channel.status !== 'inactive') {
                        // Use database status if memory shows inactive but DB shows different status
                        status = channel.status;
                    }
                    return {
                        channelId: channel.channelId,
                        name: channel.name,
                        status,
                        lastStatusUpdate: channel.lastStatusUpdate,
                        isActive: channel.isActive,
                        phoneNumber: (_a = channel.config) === null || _a === void 0 ? void 0 : _a.phoneNumber,
                        createdAt: channel.createdAt,
                    };
                });
                res.status(200).json({
                    ok: true,
                    payload: channelsWithStatus,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Gets QR code for a channel (if available)
         */
        this.getQRCode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const { channelId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Check if QR is available in config
                const qrCode = (_a = channel.config) === null || _a === void 0 ? void 0 : _a.qrCode;
                if (!qrCode) {
                    return utils.handleError(res, utils.buildErrObject(404, 'QR_CODE_NOT_AVAILABLE'));
                }
                res.status(200).json({
                    ok: true,
                    payload: {
                        channelId,
                        qrCode,
                        status: channel.status,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Requests a pairing code for a channel
         */
        this.requestPairingCode = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { phoneNumber } = req.body;
                if (!phoneNumber) {
                    return utils.handleError(res, utils.buildErrObject(400, 'PHONE_NUMBER_REQUIRED'));
                }
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Connect with pairing code
                yield WhatsAppService_1.whatsAppService.connectChannel(channelId, phoneNumber);
                res.status(200).json({
                    ok: true,
                    message: 'Pairing code requested',
                    channelId,
                    status: 'connecting',
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Deletes a WhatsApp channel completely
         */
        this.deleteChannel = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                // Find channel first
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Check if channel is currently connected and disconnect if needed
                const currentStatus = WhatsAppService_1.whatsAppService.getChannelStatus(channelId);
                if (currentStatus === 'active' || currentStatus === 'connecting') {
                    console.log(`🔌 Disconnecting channel ${channelId} before deletion...`);
                    yield WhatsAppService_1.whatsAppService.disconnectChannel(channelId);
                }
                // Clear auth state and credentials
                console.log(`🧹 Clearing auth state for channel ${channelId}...`);
                yield WhatsAppService_1.whatsAppService.clearAuthState(channelId);
                // Remove from WhatsApp service memory
                console.log(`🗑️ Removing channel ${channelId} from service memory...`);
                yield WhatsAppService_1.whatsAppService.removeChannel(channelId);
                // Delete channel from database
                console.log(`🗄️ Deleting channel ${channelId} from database...`);
                yield Channels_1.default.deleteOne({ channelId });
                console.log(`✅ Channel ${channelId} (${channel.name}) deleted successfully`);
                res.status(200).json({
                    ok: true,
                    message: 'Channel deleted successfully',
                    payload: {
                        channelId,
                        name: channel.name,
                        deletedAt: new Date().toISOString(),
                    },
                });
            }
            catch (error) {
                console.error(`❌ Error deleting channel:`, error);
                utils.handleError(res, error);
            }
        });
        /**
         * Clears auth state for a channel (for debugging)
         */
        this.clearAuthState = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Clear auth state
                yield WhatsAppService_1.whatsAppService.clearAuthState(channelId);
                res.status(200).json({
                    ok: true,
                    message: 'Auth state cleared',
                    channelId,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
    }
}
const whatsAppController = new WhatsAppController();
exports.default = whatsAppController;
//# sourceMappingURL=whatsapp.controller.js.map