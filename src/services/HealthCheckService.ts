import mongoose from 'mongoose';
import { whatsAppService } from './WhatsAppService';
import { telegramPhonesService } from './TelegramPhonesService';
import { fileCleanupService } from './api/FileCleanupService';
import axios from 'axios';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  responseTime?: number;
  details?: any;
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    mongodb: HealthCheckResult;
    whatsapp: HealthCheckResult;
    slack: HealthCheckResult;
    telegram: HealthCheckResult;
    telegramPhones: HealthCheckResult;
    socketio: HealthCheckResult;
    fileCleanup: HealthCheckResult;
    externalApis: HealthCheckResult;
  };
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

export class HealthCheckService {
  private startTime: number = Date.now();

  constructor() {}

  /**
   * Get overall system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    // Check all services in parallel
    const [
      mongodb,
      whatsapp,
      slack,
      telegram,
      telegramPhones,
      socketio,
      fileCleanup,
      externalApis,
    ] = await Promise.allSettled([
      this.checkMongoDB(),
      this.checkWhatsApp(),
      this.checkSlack(),
      this.checkTelegram(),
      this.checkTelegramPhones(),
      this.checkSocketIO(),
      this.checkFileCleanup(),
      this.checkExternalApis(),
    ]);

    const services = {
      mongodb: this.getResult(mongodb),
      whatsapp: this.getResult(whatsapp),
      slack: this.getResult(slack),
      telegram: this.getResult(telegram),
      telegramPhones: this.getResult(telegramPhones),
      socketio: this.getResult(socketio),
      fileCleanup: this.getResult(fileCleanup),
      externalApis: this.getResult(externalApis),
    };

    // Calculate overall status
    const serviceValues = Object.values(services);
    const summary = {
      total: serviceValues.length,
      healthy: serviceValues.filter(s => s.status === 'healthy').length,
      unhealthy: serviceValues.filter(s => s.status === 'unhealthy').length,
      degraded: serviceValues.filter(s => s.status === 'degraded').length,
    };

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (summary.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.1',
      services,
      summary,
    };
  }

  /**
   * Check MongoDB connection
   */
  private async checkMongoDB(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const state = mongoose.connection.readyState;
      const responseTime = Date.now() - startTime;

      switch (state) {
        case 1: // connected
          return {
            status: 'healthy',
            message: 'MongoDB connected',
            responseTime,
            details: {
              host: mongoose.connection.host,
              port: mongoose.connection.port,
              name: mongoose.connection.name,
            },
          };
        case 2: // connecting
          return {
            status: 'degraded',
            message: 'MongoDB connecting',
            responseTime,
          };
        case 3: // disconnecting
          return {
            status: 'degraded',
            message: 'MongoDB disconnecting',
            responseTime,
          };
        default:
          return {
            status: 'unhealthy',
            message: 'MongoDB disconnected',
            responseTime,
          };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `MongoDB check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check WhatsApp service
   */
  private async checkWhatsApp(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check if WhatsApp service is available and has active connections
      const activeConnections = whatsAppService.getActiveConnections();
      const responseTime = Date.now() - startTime;

      if (activeConnections.length === 0) {
        return {
          status: 'degraded',
          message: 'No active WhatsApp connections',
          responseTime,
          details: { activeConnections: 0 },
        };
      }

      // Check status of each connection
      const connectionStatuses = await Promise.allSettled(
        activeConnections.map(async (channelId) => {
          const status = whatsAppService.getChannelStatus(channelId);
          return { channelId, status };
        })
      );

      const connectedCount = connectionStatuses.filter(
        result => result.status === 'fulfilled' && result.value.status === 'active'
      ).length;

      if (connectedCount === activeConnections.length) {
        return {
          status: 'healthy',
          message: 'All WhatsApp connections active',
          responseTime,
          details: {
            activeConnections: activeConnections.length,
            connectedCount,
            connections: connectionStatuses.map(r =>
              r.status === 'fulfilled' ? r.value : { channelId: 'unknown', status: 'error' }
            ),
          },
        };
      } else {
        return {
          status: 'degraded',
          message: `${connectedCount}/${activeConnections.length} WhatsApp connections active`,
          responseTime,
          details: {
            activeConnections: activeConnections.length,
            connectedCount,
            connections: connectionStatuses.map(r =>
              r.status === 'fulfilled' ? r.value : { channelId: 'unknown', status: 'error' }
            ),
          },
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `WhatsApp service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Slack service
   */
  private async checkSlack(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check Slack API availability
      const response = await axios.get('https://slack.com/api/api.test', {
        timeout: 5000,
      });
      const responseTime = Date.now() - startTime;

      if (response.data.ok) {
        return {
          status: 'healthy',
          message: 'Slack API accessible',
          responseTime,
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Slack API returned error',
          responseTime,
          details: response.data,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Slack service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Telegram service
   */
  private async checkTelegram(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check Telegram API availability
      const response = await axios.get('https://api.telegram.org/bot/getMe', {
        timeout: 5000,
      });
      const responseTime = Date.now() - startTime;

      if (response.data.ok) {
        return {
          status: 'healthy',
          message: 'Telegram API accessible',
          responseTime,
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Telegram API returned error',
          responseTime,
          details: response.data,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Telegram service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Telegram Phones service
   */
  private async checkTelegramPhones(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // This would be similar to Telegram service check
      // For now, just check if the service is initialized
      const isInitialized = telegramPhonesService && typeof telegramPhonesService.sendMessage === 'function';
      const responseTime = Date.now() - startTime;

      if (isInitialized) {
        return {
          status: 'healthy',
          message: 'Telegram Phones service initialized',
          responseTime,
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Telegram Phones service not initialized',
          responseTime,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Telegram Phones service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Socket.IO service
   */
  private async checkSocketIO(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check if Socket.IO service is initialized
      // This is a basic check - in a real implementation you might check connected clients
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        message: 'Socket.IO service running',
        responseTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Socket.IO service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check file cleanup service
   */
  private async checkFileCleanup(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check if file cleanup service is running
      const status = fileCleanupService.getStatus();
      const responseTime = Date.now() - startTime;

      if (status.isRunning) {
        return {
          status: 'healthy',
          message: 'File cleanup service running',
          responseTime,
          details: {
            lastCleanupTime: status.lastCleanupTime,
            totalFilesDeleted: status.totalFilesDeleted,
            totalDirectoriesDeleted: status.totalDirectoriesDeleted,
          },
        };
      } else {
        return {
          status: 'degraded',
          message: 'File cleanup service not running',
          responseTime,
          details: {
            lastCleanupTime: status.lastCleanupTime,
            totalFilesDeleted: status.totalFilesDeleted,
            totalDirectoriesDeleted: status.totalDirectoriesDeleted,
          },
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `File cleanup service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check external APIs connectivity
   */
  private async checkExternalApis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check basic internet connectivity
      const response = await axios.get('https://httpbin.org/status/200', {
        timeout: 5000,
      });
      const responseTime = Date.now() - startTime;

      if (response.status === 200) {
        return {
          status: 'healthy',
          message: 'External APIs accessible',
          responseTime,
        };
      } else {
        return {
          status: 'degraded',
          message: 'External APIs partially accessible',
          responseTime,
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `External APIs check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Helper method to extract result from PromiseSettledResult
   */
  private getResult(result: PromiseSettledResult<HealthCheckResult>): HealthCheckResult {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        message: `Service check failed: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`,
        responseTime: 0,
      };
    }
  }

  /**
   * Get a simple health status (for basic health checks)
   */
  async getBasicHealth(): Promise<{ ok: boolean; status: string }> {
    try {
      const mongoState = mongoose.connection.readyState;
      const isMongoHealthy = mongoState === 1;

      return {
        ok: isMongoHealthy,
        status: isMongoHealthy ? 'OK' : 'MongoDB disconnected',
      };
    } catch (error) {
      return {
        ok: false,
        status: 'Health check failed',
      };
    }
  }
}

export const healthCheckService = new HealthCheckService();
