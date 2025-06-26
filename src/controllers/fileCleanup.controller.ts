import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { fileCleanupService } from '../services/FileCleanupService';

/**
 * Controller for file cleanup service management
 */
class FileCleanupController {
  /**
   * Get cleanup service status
   */
  public getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = fileCleanupService.getStatus();
      const config = fileCleanupService.getConfig();

      res.status(200).json({
        success: true,
        data: {
          status,
          config,
        },
      });
    } catch (error) {
      console.error('Error getting cleanup service status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get cleanup service status',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Manually trigger cleanup
   */
  public triggerCleanup = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        });
        return;
      }

      await fileCleanupService.manualCleanup();

      const status = fileCleanupService.getStatus();
      res.status(200).json({
        success: true,
        message: 'Cleanup completed successfully',
        data: status,
      });
    } catch (error) {
      console.error('Error triggering manual cleanup:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to trigger cleanup',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Get cleanup configuration
   */
  public getConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const config = fileCleanupService.getConfig();

      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error('Error getting cleanup configuration:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get cleanup configuration',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * Get cleanup service health check
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = fileCleanupService.getStatus();
      const isHealthy = status.isRunning;

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        message: isHealthy
          ? 'Cleanup service is healthy'
          : 'Cleanup service is not running',
        data: {
          isRunning: status.isRunning,
          lastCleanupTime: status.lastCleanupTime,
          nextCleanupTime: status.nextCleanupTime,
        },
      });
    } catch (error) {
      console.error('Error checking cleanup service health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check cleanup service health',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export default new FileCleanupController();
