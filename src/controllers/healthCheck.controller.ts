import { Request, Response } from 'express';
import { manualHealthCheck } from '../cronjobs/WhatsAppHealthCheckCron';
import * as utils from '../helpers/utils';

/**
 * Controller for WhatsApp Health Check
 */
class HealthCheckController {
  /**
   * Manual health check for all WhatsApp channels
   * GET /api/health-check/whatsapp
   * @returns {
   *   ok: boolean,
   *   summary: {
   *     total: number,
   *     healthy: number,
   *     unhealthy: number
   *   },
   *   healthy: string[],
   *   affected: Array<{
   *     channelId: string,
   *     phoneNumber?: string,
   *     status: string,
   *     statusDescription: string
   *   }>
   * }
   */
  public checkWhatsAppHealth = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      console.log('🔍 Manual health check requested via API');

      // Run health check
      const result = await manualHealthCheck();

      // Helper function to get human-readable status
      const getStatusDescription = (status: string): string => {
        const statusMap: Record<string, string> = {
          healthy: 'Healthy',
          no_connection: 'No Connection',
          status_inactive: 'Inactive',
          status_disconnected: 'Disconnected',
          status_connecting: 'Connecting',
          status_qr_ready: 'QR Ready',
          status_pairing_code_ready: 'Pairing Code Ready',
          phone_not_registered: 'Number Not Registered',
          check_error: 'Check Error',
        };

        // Handle status_ prefix
        const normalizedStatus = status.startsWith('status_')
          ? status
          : `status_${status}`;

        return (
          statusMap[normalizedStatus] ||
          statusMap[status] ||
          status
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase())
        );
      };

      // Format affected channels with descriptions
      const affectedChannels = result.unhealthy.map((channel) => ({
        channelId: channel.channelId,
        phoneNumber: channel.phoneNumber || null,
        status: channel.status,
        statusDescription: getStatusDescription(channel.status),
      }));

      const total = result.healthy.length + result.unhealthy.length;

      // Build response
      const response = {
        ok: true,
        message: 'Health check completed successfully',
        timestamp: new Date().toISOString(),
        summary: {
          total,
          healthy: result.healthy.length,
          unhealthy: result.unhealthy.length,
        },
        healthy: result.healthy,
        affected: affectedChannels,
      };

      console.log(
        `✅ Manual health check completed: ${result.healthy.length} healthy, ${result.unhealthy.length} affected`,
      );

      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Error in manual health check:', error);
      utils.handleError(res, error);
    }
  };

  /**
   * Get health check status for all phone numbers
   * GET /api/health_check/status
   * Same as /whatsapp endpoint - returns health status of all channels
   */
  public getHealthCheckStatus = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    // This endpoint does the same as checkWhatsAppHealth
    // Just a shorter alias for convenience
    return this.checkWhatsAppHealth(req, res);
  };
}

export default new HealthCheckController();

