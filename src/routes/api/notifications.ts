import express from 'express';
import notificationsController from '../../controllers/notifications.controller';

const router = express.Router();

/**
 * Send notification through any provider
 * POST /api/notifications/send
 */
router.post('/send', notificationsController.send);

/**
 * Send notification to multiple providers
 * POST /api/notifications/send-multi
 */
router.post('/send-multi', notificationsController.sendMulti);

export default router;
