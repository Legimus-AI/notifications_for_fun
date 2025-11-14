import { Router } from 'express';
import telegramPhonesController from '../../controllers/telegramPhones.controller';

const router = Router();

/**
 * @route POST /api/telegram-phones/channels
 * @desc Create a new Telegram Phones channel
 * @access Public
 */
router.post('/channels', telegramPhonesController.createChannel);

/**
 * @route GET /api/telegram-phones/channels
 * @desc List all Telegram Phones channels
 * @access Public
 */
router.get('/channels', telegramPhonesController.listChannels);

/**
 * @route GET /api/telegram-phones/channels/:channelId
 * @desc Get a specific Telegram Phones channel
 * @access Public
 */
router.get('/channels/:channelId', telegramPhonesController.getChannel);

/**
 * @route PUT /api/telegram-phones/channels/:channelId
 * @desc Update a Telegram Phones channel
 * @access Public
 */
router.put('/channels/:channelId', telegramPhonesController.updateChannel);

/**
 * @route DELETE /api/telegram-phones/channels/:channelId
 * @desc Delete a Telegram Phones channel
 * @access Public
 */
router.delete('/channels/:channelId', telegramPhonesController.deleteChannel);

/**
 * @route POST /api/telegram-phones/:channelId/send
 * @desc Send a message through Telegram Phones
 * @access Public
 */
router.post('/:channelId/send', telegramPhonesController.sendMessage);

/**
 * @route POST /api/telegram-phones/:channelId/call
 * @desc Initiate a phone call using CallMeBot
 * @access Public
 */
router.post('/:channelId/call', telegramPhonesController.initiateCall);

/**
 * @route POST /api/telegram-phones/:channelId/call-request
 * @desc Send a message with a call request button
 * @access Public
 */
router.post('/:channelId/call-request', telegramPhonesController.sendCallRequest);

export default router;
