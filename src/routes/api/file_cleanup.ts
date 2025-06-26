import express from 'express';
import passport from 'passport';
import fileCleanupController from '../../controllers/fileCleanup.controller';

const router = express.Router();

/**
 * @route   GET /api/file-cleanup/status
 * @desc    Get file cleanup service status and configuration
 * @access  Private (requires authentication)
 */
router.get(
  '/status',
  passport.authenticate('jwt', { session: false }),
  fileCleanupController.getStatus,
);

/**
 * @route   POST /api/file-cleanup/trigger
 * @desc    Manually trigger file cleanup
 * @access  Private (requires authentication)
 */
router.post(
  '/trigger',
  passport.authenticate('jwt', { session: false }),
  fileCleanupController.triggerCleanup,
);

/**
 * @route   GET /api/file-cleanup/config
 * @desc    Get file cleanup service configuration
 * @access  Private (requires authentication)
 */
router.get(
  '/config',
  passport.authenticate('jwt', { session: false }),
  fileCleanupController.getConfig,
);

/**
 * @route   GET /api/file-cleanup/health
 * @desc    Health check for file cleanup service
 * @access  Public
 */
router.get('/health', fileCleanupController.healthCheck);

export default router;
