import { Router } from 'express';
import telegramGhostCallerController from '../../controllers/telegramGhostCaller.controller';

const router = Router();

/**
 * @route POST /api/telegram_ghost_caller/channels
 * @desc Create a new Telegram Ghost Caller channel
 * @access Public
 */
router.post('/channels', telegramGhostCallerController.createChannel);

/**
 * @route GET /api/telegram_ghost_caller/channels
 * @desc List all Telegram Ghost Caller channels
 * @access Public
 */
router.get('/channels', telegramGhostCallerController.listChannels);

/**
 * @route GET /api/telegram_ghost_caller/channels/:channelId
 * @desc Get a specific Telegram Ghost Caller channel
 * @access Public
 */
router.get('/channels/:channelId', telegramGhostCallerController.getChannel);

/**
 * @route PUT /api/telegram_ghost_caller/channels/:channelId
 * @desc Update a Telegram Ghost Caller channel
 * @access Public
 */
router.put('/channels/:channelId', telegramGhostCallerController.updateChannel);

/**
 * @route DELETE /api/telegram_ghost_caller/channels/:channelId
 * @desc Delete a Telegram Ghost Caller channel
 * @access Public
 */
router.delete('/channels/:channelId', telegramGhostCallerController.deleteChannel);

/**
 * @route POST /api/telegram_ghost_caller/:channelId/login
 * @desc Initiate login process for authentication
 * @access Public
 */
router.post('/:channelId/login', telegramGhostCallerController.initiateLogin);

/**
 * @route POST /api/telegram_ghost_caller/:channelId/verify
 * @desc Complete login with verification code (and optional 2FA password)
 * @access Public
 */
router.post('/:channelId/verify', telegramGhostCallerController.completeLogin);

/**
 * @route GET /api/telegram_ghost_caller/:channelId/status
 * @desc Get connection status for a channel
 * @access Public
 */
router.get('/:channelId/status', telegramGhostCallerController.getStatus);

/**
 * @route POST /api/telegram_ghost_caller/:channelId/send
 * @desc Send a message through Telegram Ghost Caller
 * @access Public
 */
router.post('/:channelId/send', telegramGhostCallerController.sendMessage);

/**
 * @route POST /api/telegram_ghost_caller/:channelId/alert
 * @desc Send an aggressive sound alert (voice note) to bypass silent notifications
 * @access Public
 */
router.post('/:channelId/alert', telegramGhostCallerController.sendSoundAlert);

/**
 * @route POST /api/telegram_ghost_caller/:channelId/call
 * @desc Initiate a ghost call (VoIP call that rings but doesn't connect audio)
 * @body {string} recipient - Username or phone number to call
 * @body {string} [wakeUpMessage] - Optional message to send before call
 * @body {string} [ttsText] - Optional text to convert to speech and send as voice note before call
 * @body {string} [ttsVoice] - Optional Gemini TTS voice name (default: 'Puck')
 * @access Public
 */
router.post('/:channelId/call', telegramGhostCallerController.initiateCall);

export default router;
