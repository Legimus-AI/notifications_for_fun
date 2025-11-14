"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const telegramPhones_controller_1 = __importDefault(require("../../controllers/telegramPhones.controller"));
const router = (0, express_1.Router)();
/**
 * @route POST /api/telegram-phones/channels
 * @desc Create a new Telegram Phones channel
 * @access Public
 */
router.post('/channels', telegramPhones_controller_1.default.createChannel);
/**
 * @route GET /api/telegram-phones/channels
 * @desc List all Telegram Phones channels
 * @access Public
 */
router.get('/channels', telegramPhones_controller_1.default.listChannels);
/**
 * @route GET /api/telegram-phones/channels/:channelId
 * @desc Get a specific Telegram Phones channel
 * @access Public
 */
router.get('/channels/:channelId', telegramPhones_controller_1.default.getChannel);
/**
 * @route PUT /api/telegram-phones/channels/:channelId
 * @desc Update a Telegram Phones channel
 * @access Public
 */
router.put('/channels/:channelId', telegramPhones_controller_1.default.updateChannel);
/**
 * @route DELETE /api/telegram-phones/channels/:channelId
 * @desc Delete a Telegram Phones channel
 * @access Public
 */
router.delete('/channels/:channelId', telegramPhones_controller_1.default.deleteChannel);
/**
 * @route POST /api/telegram-phones/:channelId/send
 * @desc Send a message through Telegram Phones
 * @access Public
 */
router.post('/:channelId/send', telegramPhones_controller_1.default.sendMessage);
/**
 * @route POST /api/telegram-phones/:channelId/call
 * @desc Initiate a phone call using CallMeBot
 * @access Public
 */
router.post('/:channelId/call', telegramPhones_controller_1.default.initiateCall);
/**
 * @route POST /api/telegram-phones/:channelId/call-request
 * @desc Send a message with a call request button
 * @access Public
 */
router.post('/:channelId/call-request', telegramPhones_controller_1.default.sendCallRequest);
exports.default = router;
//# sourceMappingURL=telegram_phones.js.map