import express from 'express';
// import passport from 'passport';
import healthCheckController from '../../controllers/healthCheck.controller';

const router = express.Router();

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
router.get(
  '/whatsapp',
  // passport.authenticate('jwt', { session: false }),
  healthCheckController.checkWhatsAppHealth,
);

/**
 * @route   GET /api/health_check/status
 * @desc    Get health check status for all phone numbers (alias for /whatsapp)
 * @access  Public
 * @returns Same response as /whatsapp endpoint
 */
router.get(
  '/status',
  // passport.authenticate('jwt', { session: false }),
  healthCheckController.getHealthCheckStatus,
);

/**
 * @route   GET /api/health_check/channels
 * @desc    Per-channel connection metrics (status, lastStatusCode, reconnectCount,
 *          connectedSince, lastDisconnectAt) + process uptime/memory.
 * @access  Public
 */
router.get(
  '/channels',
  // passport.authenticate('jwt', { session: false }),
  healthCheckController.getChannelMetrics,
);

export default router;
