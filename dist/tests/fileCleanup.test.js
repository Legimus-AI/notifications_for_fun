"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const FileCleanupService_1 = require("../services/api/FileCleanupService");
describe('FileCleanupService', () => {
    let cleanupService;
    let testDir;
    beforeEach(() => {
        // Create a temporary test directory
        testDir = path_1.default.join(process.cwd(), 'test-storage');
        if (!fs_1.default.existsSync(testDir)) {
            fs_1.default.mkdirSync(testDir, { recursive: true });
        }
        cleanupService = new FileCleanupService_1.FileCleanupService(testDir, 0.1); // 0.1 hours = 6 minutes for testing
    });
    afterEach(() => {
        // Clean up test directory
        if (fs_1.default.existsSync(testDir)) {
            fs_1.default.rmSync(testDir, { recursive: true, force: true });
        }
        // Stop the cleanup service
        cleanupService.stop();
    });
    describe('constructor', () => {
        it('should initialize with default values', () => {
            const defaultService = new FileCleanupService_1.FileCleanupService();
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
        it('should delete old files', () => __awaiter(void 0, void 0, void 0, function* () {
            // Create test files
            const oldFile = path_1.default.join(testDir, 'old-file.txt');
            const newFile = path_1.default.join(testDir, 'new-file.txt');
            fs_1.default.writeFileSync(oldFile, 'old content');
            fs_1.default.writeFileSync(newFile, 'new content');
            // Manually set the birthtime of the old file to be older than maxAge
            const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
            fs_1.default.utimesSync(oldFile, oldTime, oldTime);
            // Wait a moment to ensure time difference
            yield new Promise((resolve) => setTimeout(resolve, 100));
            // Run cleanup
            yield cleanupService.manualCleanup();
            // Check results
            expect(fs_1.default.existsSync(oldFile)).toBe(false);
            expect(fs_1.default.existsSync(newFile)).toBe(true);
        }));
        it('should delete empty directories after file cleanup', () => __awaiter(void 0, void 0, void 0, function* () {
            // Create nested directory structure with old files
            const subDir = path_1.default.join(testDir, 'subdir');
            fs_1.default.mkdirSync(subDir);
            const oldFile = path_1.default.join(subDir, 'old-file.txt');
            fs_1.default.writeFileSync(oldFile, 'old content');
            // Set old timestamp
            const oldTime = new Date(Date.now() - 10 * 60 * 1000);
            fs_1.default.utimesSync(oldFile, oldTime, oldTime);
            fs_1.default.utimesSync(subDir, oldTime, oldTime);
            // Run cleanup
            yield cleanupService.manualCleanup();
            // Directory should be removed since it's empty and old
            expect(fs_1.default.existsSync(oldFile)).toBe(false);
            expect(fs_1.default.existsSync(subDir)).toBe(false);
        }));
        it('should track cleanup statistics', () => __awaiter(void 0, void 0, void 0, function* () {
            // Create test files
            const file1 = path_1.default.join(testDir, 'file1.txt');
            const file2 = path_1.default.join(testDir, 'file2.txt');
            fs_1.default.writeFileSync(file1, 'content1');
            fs_1.default.writeFileSync(file2, 'content2');
            // Set old timestamps
            const oldTime = new Date(Date.now() - 10 * 60 * 1000);
            fs_1.default.utimesSync(file1, oldTime, oldTime);
            fs_1.default.utimesSync(file2, oldTime, oldTime);
            // Run cleanup
            yield cleanupService.manualCleanup();
            const status = cleanupService.getStatus();
            expect(status.totalFilesDeleted).toBe(2);
            expect(status.lastCleanupTime).not.toBeNull();
        }));
    });
    describe('edge cases', () => {
        it('should handle non-existent storage directory gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
            const nonExistentService = new FileCleanupService_1.FileCleanupService('/non/existent/path', 12);
            // Should not throw error
            yield expect(nonExistentService.manualCleanup()).resolves.not.toThrow();
        }));
        it('should handle permission errors gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
            // This test would need to be adapted based on the OS and permissions available
            // For now, just ensure the service doesn't crash on errors
            yield expect(cleanupService.manualCleanup()).resolves.not.toThrow();
        }));
    });
});
//# sourceMappingURL=fileCleanup.test.js.map