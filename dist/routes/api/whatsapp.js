"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const whatsapp_controller_1 = __importDefault(require("../../controllers/whatsapp.controller"));
const router = express_1.default.Router();
/**
 * @route   POST /whatsapp/channels
 * @desc    Create a new WhatsApp channel
 * @access  Public
 * @body    { name: string, phoneNumber?: string }
 */
router.post('/channels', whatsapp_controller_1.default.createChannel);
/**
 * @route   GET /whatsapp/channels
 * @desc    List all WhatsApp channels
 * @access  Public
 */
router.get('/channels', whatsapp_controller_1.default.listChannels);
/**
 * @route   POST /whatsapp/channels/:channelId/connect
 * @desc    Connect/start a WhatsApp channel
 * @access  Public
 * @body    { phoneNumber?: string } // Optional for pairing code
 */
router.post('/channels/:channelId/connect', whatsapp_controller_1.default.connectChannel);
/**
 * @route   POST /whatsapp/channels/:channelId/disconnect
 * @desc    Disconnect a WhatsApp channel
 * @access  Public
 */
router.post('/channels/:channelId/disconnect', whatsapp_controller_1.default.disconnectChannel);
/**
 * @route   GET /whatsapp/channels/:channelId/status
 * @desc    Get channel status
 * @access  Public
 */
router.get('/channels/:channelId/status', whatsapp_controller_1.default.getChannelStatus);
/**
 * @route   DELETE /whatsapp/channels/:channelId
 * @desc    Delete a WhatsApp channel completely
 * @access  Public
 */
router.delete('/channels/:channelId', whatsapp_controller_1.default.deleteChannel);
/**
 * @route   GET /whatsapp/channels/:channelId/qr
 * @desc    Get QR code for channel (if available)
 * @access  Public
 */
router.get('/channels/:channelId/qr', whatsapp_controller_1.default.getQRCode);
/**
 * @route   POST /whatsapp/channels/:channelId/pairing-code
 * @desc    Request pairing code for channel
 * @access  Public
 * @body    { phoneNumber: string }
 */
router.post('/channels/:channelId/pairing-code', whatsapp_controller_1.default.requestPairingCode);
/**
 * @route   POST /whatsapp/channels/:channelId/send
 * @desc    Send a text message through WhatsApp
 * @access  Public
 * @body    { to: string, message: string, type?: 'text' }
 */
router.post('/channels/:channelId/send', whatsapp_controller_1.default.sendMessage);
/**
 * @route   POST /whatsapp/channels/:channelId/send-media
 * @desc    Send a media message through WhatsApp
 * @access  Public
 * @body    { to: string, mediaType: 'image'|'video'|'audio'|'document', mediaUrl: string, caption?: string }
 */
router.post('/channels/:channelId/send-media', whatsapp_controller_1.default.sendMediaMessage);
/**
 * @route   DELETE /whatsapp/channels/:channelId/auth
 * @desc    Clear auth state for a channel (for debugging)
 * @access  Public
 */
router.delete('/channels/:channelId/auth', whatsapp_controller_1.default.clearAuthState);
exports.default = router;
//# sourceMappingURL=whatsapp.js.map