"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const slack_controller_1 = __importDefault(require("../../controllers/slack.controller"));
const router = express_1.default.Router();
//
// Channel Management Routes
//
router.post('/channels', slack_controller_1.default.createChannel);
router.get('/channels', slack_controller_1.default.listChannels);
router.delete('/channels/:channelId', slack_controller_1.default.deleteChannel);
//
// Messaging Routes
//
router.post('/channels/:channelId/send-message', slack_controller_1.default.sendMessage);
exports.default = router;
//# sourceMappingURL=slack.js.map