"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
// import passport from 'passport';
const healthCheck_controller_1 = __importDefault(require("../../controllers/healthCheck.controller"));
const router = express_1.default.Router();
/**
 * @route   GET /api/health_check/whatsapp
 * @desc    Manually check health of all WhatsApp channels
 * @access  Private (requires authentication)
 * @returns {
 *   ok: boolean,
 *   message: string,
 *   timestamp: string,
 *   summary: { total: number, healthy: number, unhealthy: number },
 *   healthy: string[],
 *   affected: Array<{ channelId, phoneNumber, status, statusDescription }>
 * }
 */
router.get('/whatsapp', 
// passport.authenticate('jwt', { session: false }),
healthCheck_controller_1.default.checkWhatsAppHealth);
/**
 * @route   GET /api/health_check/status
 * @desc    Get health check status for all phone numbers (alias for /whatsapp)
 * @access  Public
 * @returns Same response as /whatsapp endpoint
 */
router.get('/status', 
// passport.authenticate('jwt', { session: false }),
healthCheck_controller_1.default.getHealthCheckStatus);
exports.default = router;
//# sourceMappingURL=health_check.js.map