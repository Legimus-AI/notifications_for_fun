"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notifications_controller_1 = __importDefault(require("../../controllers/notifications.controller"));
const router = express_1.default.Router();
/**
 * Send notification through any provider
 * POST /api/notifications/send
 */
router.post('/send', notifications_controller_1.default.send);
/**
 * Send notification to multiple providers
 * POST /api/notifications/send-multi
 */
router.post('/send-multi', notifications_controller_1.default.sendMulti);
exports.default = router;
//# sourceMappingURL=notifications.js.map