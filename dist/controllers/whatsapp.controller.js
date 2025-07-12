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
const utils_1 = require("../helpers/utils");
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
                        webhooks: channel.webhooks,
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
         * Refreshes QR code for an existing channel (when logged out or QR expired)
         */
        this.refreshQR = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Check current status
                const currentStatus = WhatsAppService_1.whatsAppService.getChannelStatus(channelId);
                console.log(`🔄 Refreshing QR for channel ${channelId}, current status: ${currentStatus}`);
                // Refresh QR code
                yield WhatsAppService_1.whatsAppService.refreshQRCode(channelId);
                res.status(200).json({
                    ok: true,
                    message: 'QR code refresh initiated',
                    channelId,
                    status: 'generating_qr',
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
        /**
         * Sends a message through a specific channel.
         * The payload should be similar to the WhatsApp Cloud API.
         */
        this.sendMessageFromApi = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const payload = req.body;
                const result = yield WhatsAppService_1.whatsAppService.sendMessageFromApi(channelId, payload);
                // Format response to match WhatsApp Cloud API
                const wa_id = result.key.remoteJid.split('@')[0];
                const formattedResponse = {
                    messaging_product: 'whatsapp',
                    contacts: [
                        {
                            input: payload.to,
                            wa_id: wa_id,
                        },
                    ],
                    messages: [
                        {
                            id: result.key.id,
                        },
                    ],
                };
                res.status(200).json(formattedResponse);
            }
            catch (error) {
                console.error('Error sending message via API:', error);
                (0, utils_1.handleError)(res, error);
            }
        });
        /**
         * Checks if a WhatsApp ID (JID) exists.
         */
        this.checkContact = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId, jid } = req.params;
                const result = yield WhatsAppService_1.whatsAppService.checkIdExists(channelId, jid);
                res.status(200).json({
                    ok: true,
                    payload: result,
                });
            }
            catch (error) {
                (0, utils_1.handleError)(res, error);
            }
        });
        /**
         * Fetches the status of a WhatsApp contact.
         */
        this.getContactStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId, jid } = req.params;
                const result = yield WhatsAppService_1.whatsAppService.fetchContactStatus(channelId, jid);
                if (result) {
                    res.status(200).json({
                        ok: true,
                        payload: result,
                    });
                }
                else {
                    (0, utils_1.handleError)(res, {
                        code: 404,
                        message: 'Status not found or private.',
                    });
                }
            }
            catch (error) {
                (0, utils_1.handleError)(res, error);
            }
        });
        /**
         * Fetches the profile picture of a WhatsApp contact.
         */
        this.getProfilePicture = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                let { jid } = req.params;
                console.log('Original jid:', jid);
                jid = (0, utils_1.formatJid)(jid);
                console.log('Formatted jid:', jid);
                const { type } = req.query; // 'preview' or 'image'
                // Download and save the profile picture locally
                const localUrl = yield WhatsAppService_1.whatsAppService.downloadAndSaveProfilePicture(channelId, jid, type === 'image' ? 'image' : 'preview');
                if (localUrl) {
                    res.status(200).json({
                        ok: true,
                        payload: {
                            url: localUrl,
                            type: type === 'image' ? 'image' : 'preview',
                            jid: jid,
                        },
                    });
                }
                else {
                    (0, utils_1.handleError)(res, {
                        code: 404,
                        message: 'Profile picture not found or private.',
                    });
                }
            }
            catch (error) {
                (0, utils_1.handleError)(res, error);
            }
        });
        /**
         * Adds or updates a webhook for a WhatsApp channel
         */
        this.addWebhook = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                const { url, events } = req.body;
                // Validate required fields
                if (!url) {
                    return utils.handleError(res, utils.buildErrObject(400, 'WEBHOOK_URL_REQUIRED'));
                }
                if (!events || !Array.isArray(events) || events.length === 0) {
                    return utils.handleError(res, utils.buildErrObject(400, 'WEBHOOK_EVENTS_REQUIRED'));
                }
                // Validate events
                const validEvents = [
                    'message.received',
                    'message.sent',
                    'message.delivered',
                    'message.read',
                ];
                const invalidEvents = events.filter((event) => !validEvents.includes(event));
                if (invalidEvents.length > 0) {
                    return utils.handleError(res, utils.buildErrObject(400, `INVALID_EVENTS: ${invalidEvents.join(', ')}`));
                }
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Check if webhook with this URL already exists
                const existingWebhookIndex = channel.webhooks.findIndex((webhook) => webhook.url === url);
                if (existingWebhookIndex !== -1) {
                    // Update existing webhook using updateOne to avoid validation issues
                    yield Channels_1.default.updateOne({ channelId, 'webhooks.url': url }, {
                        $set: {
                            'webhooks.$.events': events,
                            'webhooks.$.isActive': true,
                        },
                    });
                }
                else {
                    // Add new webhook using updateOne
                    yield Channels_1.default.updateOne({ channelId }, {
                        $push: {
                            webhooks: {
                                url,
                                events,
                                isActive: true,
                            },
                        },
                    });
                }
                console.log(`📋 Webhook ${existingWebhookIndex !== -1 ? 'updated' : 'added'} for channel ${channelId}: ${url}`);
                res.status(200).json({
                    ok: true,
                    message: existingWebhookIndex !== -1 ? 'Webhook updated' : 'Webhook added',
                    payload: {
                        channelId,
                        webhook: {
                            url,
                            events,
                            isActive: true,
                        },
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Lists all webhooks for a WhatsApp channel
         */
        this.listWebhooks = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                res.status(200).json({
                    ok: true,
                    payload: {
                        channelId,
                        webhooks: channel.webhooks,
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Updates a specific webhook for a WhatsApp channel
         */
        this.updateWebhook = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId, webhookId } = req.params;
                const { url, events, isActive } = req.body;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Find webhook
                const webhook = channel.webhooks.find((w) => { var _a; return ((_a = w._id) === null || _a === void 0 ? void 0 : _a.toString()) === webhookId; });
                if (!webhook) {
                    return utils.handleError(res, utils.buildErrObject(404, 'WEBHOOK_NOT_FOUND'));
                }
                // Prepare update object
                const updateFields = {};
                if (url !== undefined)
                    updateFields['webhooks.$.url'] = url;
                if (events !== undefined) {
                    // Validate events
                    const validEvents = [
                        'message.received',
                        'message.sent',
                        'message.delivered',
                        'message.read',
                    ];
                    const invalidEvents = events.filter((event) => !validEvents.includes(event));
                    if (invalidEvents.length > 0) {
                        return utils.handleError(res, utils.buildErrObject(400, `INVALID_EVENTS: ${invalidEvents.join(', ')}`));
                    }
                    updateFields['webhooks.$.events'] = events;
                }
                if (isActive !== undefined)
                    updateFields['webhooks.$.isActive'] = isActive;
                // Update webhook using updateOne to avoid validation issues
                yield Channels_1.default.updateOne({ channelId, 'webhooks._id': webhookId }, { $set: updateFields });
                console.log(`📋 Webhook updated for channel ${channelId}: ${webhook.url}`);
                res.status(200).json({
                    ok: true,
                    message: 'Webhook updated',
                    payload: {
                        channelId,
                        webhook: {
                            id: webhook._id,
                            url: webhook.url,
                            events: webhook.events,
                            isActive: webhook.isActive,
                        },
                    },
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Deletes a webhook from a WhatsApp channel
         */
        this.deleteWebhook = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { channelId, webhookId } = req.params;
                // Find channel
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel) {
                    return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
                }
                // Find and remove webhook
                const webhookIndex = channel.webhooks.findIndex((w) => { var _a; return ((_a = w._id) === null || _a === void 0 ? void 0 : _a.toString()) === webhookId; });
                if (webhookIndex === -1) {
                    return utils.handleError(res, utils.buildErrObject(404, 'WEBHOOK_NOT_FOUND'));
                }
                const webhookUrl = channel.webhooks[webhookIndex].url;
                // Remove webhook using updateOne to avoid validation issues
                yield Channels_1.default.updateOne({ channelId }, { $pull: { webhooks: { _id: webhookId } } });
                console.log(`🗑️ Webhook deleted from channel ${channelId}: ${webhookUrl}`);
                res.status(200).json({
                    ok: true,
                    message: 'Webhook deleted',
                    payload: {
                        channelId,
                        deletedWebhookId: webhookId,
                        deletedWebhookUrl: webhookUrl,
                    },
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