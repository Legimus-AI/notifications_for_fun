/**
 * Statistics returned after a cleanup operation
 */
export interface CleanupStats {
  filesDeleted: number;
  directoriesDeleted: number;
}

/**
 * Configuration options for the FileCleanupService
 */
export interface FileCleanupConfig {
  storagePath: string;
  maxAgeHours: number;
  schedule?: string; // Cron schedule pattern
  timezone?: string;
}

/**
 * Status information for the cleanup service
 */
export interface CleanupServiceStatus {
  isRunning: boolean;
  nextCleanupTime: Date | null;
  lastCleanupTime: Date | null;
  totalFilesDeleted: number;
  totalDirectoriesDeleted: number;
}
