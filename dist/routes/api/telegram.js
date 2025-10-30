"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telegram_controller_1 = __importDefault(require("../../controllers/telegram.controller"));
const router = express_1.default.Router();
//
// Channel Management Routes
//
router.post('/channels', telegram_controller_1.default.createChannel);
router.get('/channels', telegram_controller_1.default.listChannels);
router.delete('/channels/:channelId', telegram_controller_1.default.deleteChannel);
//
// Messaging Routes
//
router.post('/channels/:channelId/send-message', telegram_controller_1.default.sendMessage);
exports.default = router;
//# sourceMappingURL=telegram.js.map