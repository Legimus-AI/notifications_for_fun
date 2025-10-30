import { Request, Response } from 'express';
import * as utils from '../helpers/utils';
import { notificationsService } from '../services/api/notifications.service';

class NotificationsController {
  /**
   * Send notification through any provider
   * POST /api/notifications/send
   */
  public send = async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider, channelId, recipient, message, options } = req.body;

      // Validate required fields
      if (!provider) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'PROVIDER_REQUIRED'),
        );
      }

      if (!channelId) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'CHANNEL_ID_REQUIRED'),
        );
      }

      if (!recipient) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'RECIPIENT_REQUIRED'),
        );
      }

      if (!message) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'MESSAGE_REQUIRED'),
        );
      }

      // Send notification through the service
      const result = await notificationsService.sendNotification(
        provider,
        channelId,
        recipient,
        message,
        options,
      );

      res.status(200).json({
        ok: true,
        message: 'Notification sent successfully',
        payload: result,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Send notifications to multiple providers
   * POST /api/notifications/send-multi
   */
  public sendMulti = async (req: Request, res: Response): Promise<void> => {
    try {
      const { notifications } = req.body;

      if (!notifications || !Array.isArray(notifications)) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'NOTIFICATIONS_ARRAY_REQUIRED'),
        );
      }

      // Send notifications through the service
      const results = await notificationsService.sendMultipleNotifications(notifications);

      res.status(200).json({
        ok: true,
        message: 'Multi-provider notification sent',
        payload: results,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };
}

const notificationsController = new NotificationsController();
export default notificationsController;
