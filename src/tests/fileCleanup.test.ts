import fs from 'fs';
import path from 'path';
import { FileCleanupService } from '../services/api/FileCleanupService';

describe('FileCleanupService', () => {
  let cleanupService: FileCleanupService;
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(process.cwd(), 'test-storage');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    cleanupService = new FileCleanupService(testDir, 0.1); // 0.1 hours = 6 minutes for testing
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Stop the cleanup service
    cleanupService.stop();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const defaultService = new FileCleanupService();
      const config = defaultService.getConfig();

      expect(config.maxAgeHours).toBe(12);
      expect(config.storagePath).toContain('storage');
    });

    it('should initialize with custom values', () => {
      const config = cleanupService.getConfig();

      expect(config.maxAgeHours).toBe(0.1);
      expect(config.storagePath).toBe(testDir);
    });
  });

  describe('start and stop', () => {
    it('should start the cleanup service', () => {
      cleanupService.start();
      const status = cleanupService.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.nextCleanupTime).not.toBeNull();
    });

    it('should stop the cleanup service', () => {
      cleanupService.start();
      cleanupService.stop();
      const status = cleanupService.getStatus();

      expect(status.isRunning).toBe(false);
    });
  });

  describe('file cleanup functionality', () => {
    it('should delete old files', async () => {
      // Create test files
      const oldFile = path.join(testDir, 'old-file.txt');
      const newFile = path.join(testDir, 'new-file.txt');

      fs.writeFileSync(oldFile, 'old content');
      fs.writeFileSync(newFile, 'new content');

      // Manually set the birthtime of the old file to be older than maxAge
      const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      fs.utimesSync(oldFile, oldTime, oldTime);

      // Wait a moment to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run cleanup
      await cleanupService.manualCleanup();

      // Check results
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(newFile)).toBe(true);
    });

    it('should delete empty directories after file cleanup', async () => {
      // Create nested directory structure with old files
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir);

      const oldFile = path.join(subDir, 'old-file.txt');
      fs.writeFileSync(oldFile, 'old content');

      // Set old timestamp
      const oldTime = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(oldFile, oldTime, oldTime);
      fs.utimesSync(subDir, oldTime, oldTime);

      // Run cleanup
      await cleanupService.manualCleanup();

      // Directory should be removed since it's empty and old
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(subDir)).toBe(false);
    });

    it('should track cleanup statistics', async () => {
      // Create test files
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');

      fs.writeFileSync(file1, 'content1');
      fs.writeFileSync(file2, 'content2');

      // Set old timestamps
      const oldTime = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(file1, oldTime, oldTime);
      fs.utimesSync(file2, oldTime, oldTime);

      // Run cleanup
      await cleanupService.manualCleanup();

      const status = cleanupService.getStatus();
      expect(status.totalFilesDeleted).toBe(2);
      expect(status.lastCleanupTime).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent storage directory gracefully', async () => {
      const nonExistentService = new FileCleanupService(
        '/non/existent/path',
        12,
      );

      // Should not throw error
      await expect(nonExistentService.manualCleanup()).resolves.not.toThrow();
    });

    it('should handle permission errors gracefully', async () => {
      // This test would need to be adapted based on the OS and permissions available
      // For now, just ensure the service doesn't crash on errors
      await expect(cleanupService.manualCleanup()).resolves.not.toThrow();
    });
  });
});
