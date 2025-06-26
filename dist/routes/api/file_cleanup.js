"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("passport"));
const fileCleanup_controller_1 = __importDefault(require("../../controllers/fileCleanup.controller"));
const router = express_1.default.Router();
/**
 * @route   GET /api/file-cleanup/status
 * @desc    Get file cleanup service status and configuration
 * @access  Private (requires authentication)
 */
router.get('/status', passport_1.default.authenticate('jwt', { session: false }), fileCleanup_controller_1.default.getStatus);
/**
 * @route   POST /api/file-cleanup/trigger
 * @desc    Manually trigger file cleanup
 * @access  Private (requires authentication)
 */
router.post('/trigger', passport_1.default.authenticate('jwt', { session: false }), fileCleanup_controller_1.default.triggerCleanup);
/**
 * @route   GET /api/file-cleanup/config
 * @desc    Get file cleanup service configuration
 * @access  Private (requires authentication)
 */
router.get('/config', passport_1.default.authenticate('jwt', { session: false }), fileCleanup_controller_1.default.getConfig);
/**
 * @route   GET /api/file-cleanup/health
 * @desc    Health check for file cleanup service
 * @access  Public
 */
router.get('/health', fileCleanup_controller_1.default.healthCheck);
exports.default = router;
//# sourceMappingURL=file_cleanup.js.map