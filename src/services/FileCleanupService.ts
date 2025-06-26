import fs from 'fs';
import path from 'path';
import * as cron from 'node-cron';
import {
  CleanupStats,
  FileCleanupConfig,
  CleanupServiceStatus,
} from '../types/FileCleanup';

/**
 * Service to handle automatic cleanup of old files from storage directory
 */
export class FileCleanupService {
  private readonly storagePath: string;
  private readonly maxAgeHours: number;
  private cleanupJob: cron.ScheduledTask | null = null;
  private lastCleanupTime: Date | null = null;
  private totalFilesDeleted: number = 0;
  private totalDirectoriesDeleted: number = 0;

  constructor(
    storagePath: string = path.join(process.cwd(), 'storage'),
    maxAgeHours: number = 12,
  ) {
    this.storagePath = storagePath;
    this.maxAgeHours = maxAgeHours;
  }

  /**
   * Initialize the cleanup service and start the scheduled job
   */
  public start(): void {
    console.log('🧹 Starting File Cleanup Service...');

    // Run cleanup immediately on start
    this.performCleanup();

    // Schedule cleanup to run every 12 hours
    this.cleanupJob = cron.schedule(
      '0 */12 * * *',
      () => {
        console.log('🧹 Running scheduled file cleanup...');
        this.performCleanup();
      },
      {
        scheduled: true,
        timezone: 'UTC',
      },
    );

    console.log('✅ File Cleanup Service started - running every 12 hours');
  }

  /**
   * Stop the cleanup service
   */
  public stop(): void {
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
      console.log('🛑 File Cleanup Service stopped');
    }
  }

  /**
   * Perform the cleanup operation
   */
  private async performCleanup(): Promise<void> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        console.log(`📁 Storage path does not exist: ${this.storagePath}`);
        return;
      }

      const stats = await this.cleanupDirectory(this.storagePath);

      // Update tracking statistics
      this.totalFilesDeleted += stats.filesDeleted;
      this.totalDirectoriesDeleted += stats.directoriesDeleted;
      this.lastCleanupTime = new Date();

      console.log(
        `🧹 Cleanup completed: ${stats.filesDeleted} files and ${stats.directoriesDeleted} directories removed`,
      );
    } catch (error) {
      console.error('❌ Error during file cleanup:', error);
    }
  }

  /**
   * Recursively clean up files in a directory
   */
  private async cleanupDirectory(dirPath: string): Promise<CleanupStats> {
    const stats: CleanupStats = { filesDeleted: 0, directoriesDeleted: 0 };

    try {
      const items = await fs.promises.readdir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.promises.stat(itemPath);

        if (stat.isDirectory()) {
          // Recursively clean subdirectories
          const subStats = await this.cleanupDirectory(itemPath);
          stats.filesDeleted += subStats.filesDeleted;
          stats.directoriesDeleted += subStats.directoriesDeleted;

          // Check if directory is now empty and old enough to delete
          const dirItems = await fs.promises.readdir(itemPath);
          if (dirItems.length === 0 && this.isOlderThanMaxAge(stat.birthtime)) {
            await fs.promises.rmdir(itemPath);
            stats.directoriesDeleted++;
            console.log(`🗑️ Deleted empty directory: ${itemPath}`);
          }
        } else if (stat.isFile()) {
          // Check if file is older than max age
          if (this.isOlderThanMaxAge(stat.birthtime)) {
            await fs.promises.unlink(itemPath);
            stats.filesDeleted++;
            console.log(`🗑️ Deleted old file: ${itemPath}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error cleaning directory ${dirPath}:`, error);
    }

    return stats;
  }

  /**
   * Check if a file/directory is older than the maximum age
   */
  private isOlderThanMaxAge(birthtime: Date): boolean {
    const now = new Date();
    const ageInHours = (now.getTime() - birthtime.getTime()) / (1000 * 60 * 60);
    return ageInHours > this.maxAgeHours;
  }

  /**
   * Get the next scheduled cleanup time
   */
  public getNextCleanupTime(): Date | null {
    if (!this.cleanupJob) return null;

    // Calculate next 12-hour interval
    const now = new Date();
    const nextCleanup = new Date(now);
    const hours = now.getHours();
    const nextHour = Math.ceil(hours / 12) * 12;

    if (nextHour >= 24) {
      nextCleanup.setDate(nextCleanup.getDate() + 1);
      nextCleanup.setHours(0, 0, 0, 0);
    } else {
      nextCleanup.setHours(nextHour, 0, 0, 0);
    }

    return nextCleanup;
  }

  /**
   * Manually trigger cleanup (useful for testing or administrative purposes)
   */
  public async manualCleanup(): Promise<void> {
    console.log('🧹 Manual cleanup triggered...');
    await this.performCleanup();
  }

  /**
   * Get the current service status
   */
  public getStatus(): CleanupServiceStatus {
    return {
      isRunning: this.cleanupJob !== null,
      nextCleanupTime: this.getNextCleanupTime(),
      lastCleanupTime: this.lastCleanupTime,
      totalFilesDeleted: this.totalFilesDeleted,
      totalDirectoriesDeleted: this.totalDirectoriesDeleted,
    };
  }

  /**
   * Get configuration information
   */
  public getConfig(): FileCleanupConfig {
    return {
      storagePath: this.storagePath,
      maxAgeHours: this.maxAgeHours,
      schedule: '0 */12 * * *',
      timezone: 'UTC',
    };
  }
}

// Export singleton instance
export const fileCleanupService = new FileCleanupService();
