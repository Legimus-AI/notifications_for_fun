import { Router } from 'express';
import telegramGhostCallerController from '../../controllers/telegramGhostCaller.controller';

const router = Router();

/**
 * @route POST /api/telegram-ghost-caller/channels
 * @desc Create a new Telegram Ghost Caller channel
 * @access Public
 */
router.post('/channels', telegramGhostCallerController.createChannel);

/**
 * @route GET /api/telegram-ghost-caller/channels
 * @desc List all Telegram Ghost Caller channels
 * @access Public
 */
router.get('/channels', telegramGhostCallerController.listChannels);

/**
 * @route GET /api/telegram-ghost-caller/channels/:channelId
 * @desc Get a specific Telegram Ghost Caller channel
 * @access Public
 */
router.get('/channels/:channelId', telegramGhostCallerController.getChannel);

/**
 * @route PUT /api/telegram-ghost-caller/channels/:channelId
 * @desc Update a Telegram Ghost Caller channel
 * @access Public
 */
router.put('/channels/:channelId', telegramGhostCallerController.updateChannel);

/**
 * @route DELETE /api/telegram-ghost-caller/channels/:channelId
 * @desc Delete a Telegram Ghost Caller channel
 * @access Public
 */
router.delete('/channels/:channelId', telegramGhostCallerController.deleteChannel);

/**
 * @route POST /api/telegram-ghost-caller/:channelId/login
 * @desc Initiate login process for authentication
 * @access Public
 */
router.post('/:channelId/login', telegramGhostCallerController.initiateLogin);

/**
 * @route POST /api/telegram-ghost-caller/:channelId/verify
 * @desc Complete login with verification code (and optional 2FA password)
 * @access Public
 */
router.post('/:channelId/verify', telegramGhostCallerController.completeLogin);

/**
 * @route GET /api/telegram-ghost-caller/:channelId/status
 * @desc Get connection status for a channel
 * @access Public
 */
router.get('/:channelId/status', telegramGhostCallerController.getStatus);

/**
 * @route POST /api/telegram-ghost-caller/:channelId/send
 * @desc Send a message through Telegram Ghost Caller
 * @access Public
 */
router.post('/:channelId/send', telegramGhostCallerController.sendMessage);

/**
 * @route POST /api/telegram-ghost-caller/:channelId/call
 * @desc Initiate a ghost call (VoIP call that rings but doesn't connect audio)
 * @access Public
 */
router.post('/:channelId/call', telegramGhostCallerController.initiateCall);

export default router;
