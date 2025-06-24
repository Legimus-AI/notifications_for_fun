import express from 'express';
import whatsAppController from '../../controllers/whatsapp.controller';

const router = express.Router();

/**
 * @route   POST /whatsapp/channels
 * @desc    Create a new WhatsApp channel
 * @access  Public
 * @body    { name: string, phoneNumber?: string }
 */
router.post('/channels', whatsAppController.createChannel);

/**
 * @route   GET /whatsapp/channels
 * @desc    List all WhatsApp channels
 * @access  Public
 */
router.get('/channels', whatsAppController.listChannels);

/**
 * @route   POST /whatsapp/channels/:channelId/connect
 * @desc    Connect/start a WhatsApp channel
 * @access  Public
 * @body    { phoneNumber?: string } // Optional for pairing code
 */
router.post('/channels/:channelId/connect', whatsAppController.connectChannel);

/**
 * @route   POST /whatsapp/channels/:channelId/disconnect
 * @desc    Disconnect a WhatsApp channel
 * @access  Public
 */
router.post(
  '/channels/:channelId/disconnect',
  whatsAppController.disconnectChannel,
);

/**
 * @route   GET /whatsapp/channels/:channelId/status
 * @desc    Get channel status
 * @access  Public
 */
router.get('/channels/:channelId/status', whatsAppController.getChannelStatus);

/**
 * @route   DELETE /whatsapp/channels/:channelId
 * @desc    Delete a WhatsApp channel completely
 * @access  Public
 */
router.delete('/channels/:channelId', whatsAppController.deleteChannel);

/**
 * @route   GET /whatsapp/channels/:channelId/qr
 * @desc    Get QR code for channel (if available)
 * @access  Public
 */
router.get('/channels/:channelId/qr', whatsAppController.getQRCode);

/**
 * @route   POST /whatsapp/channels/:channelId/pairing-code
 * @desc    Request pairing code for channel
 * @access  Public
 * @body    { phoneNumber: string }
 */
router.post(
  '/channels/:channelId/pairing-code',
  whatsAppController.requestPairingCode,
);

/**
 * @route   POST /whatsapp/channels/:channelId/send
 * @desc    Send a text message through WhatsApp
 * @access  Public
 * @body    { to: string, message: string, type?: 'text' }
 */
router.post('/channels/:channelId/send', whatsAppController.sendMessage);

/**
 * @route   POST /whatsapp/channels/:channelId/send-media
 * @desc    Send a media message through WhatsApp
 * @access  Public
 * @body    { to: string, mediaType: 'image'|'video'|'audio'|'document', mediaUrl: string, caption?: string }
 */
router.post(
  '/channels/:channelId/send-media',
  whatsAppController.sendMediaMessage,
);

/**
 * @route   DELETE /whatsapp/channels/:channelId/auth
 * @desc    Clear auth state for a channel (for debugging)
 * @access  Public
 */
router.delete('/channels/:channelId/auth', whatsAppController.clearAuthState);

export default router;
