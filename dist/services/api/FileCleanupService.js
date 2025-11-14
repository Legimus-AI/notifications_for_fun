"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.fileCleanupService = exports.FileCleanupService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cron = __importStar(require("node-cron"));
/**
 * Service to handle automatic cleanup of old files from storage directory
 */
class FileCleanupService {
    constructor(storagePath = path_1.default.join(process.cwd(), 'storage'), maxAgeHours = 12) {
        this.cleanupJob = null;
        this.lastCleanupTime = null;
        this.totalFilesDeleted = 0;
        this.totalDirectoriesDeleted = 0;
        this.storagePath = storagePath;
        this.maxAgeHours = maxAgeHours;
    }
    /**
     * Initialize the cleanup service and start the scheduled job
     */
    start() {
        console.log('🧹 Starting File Cleanup Service...');
        // Run cleanup immediately on start
        this.performCleanup();
        // Schedule cleanup to run every 12 hours
        this.cleanupJob = cron.schedule('0 */12 * * *', () => {
            console.log('🧹 Running scheduled file cleanup...');
            this.performCleanup();
        }, {
            timezone: 'UTC',
        });
        console.log('✅ File Cleanup Service started - running every 12 hours');
    }
    /**
     * Stop the cleanup service
     */
    stop() {
        if (this.cleanupJob) {
            this.cleanupJob.stop();
            this.cleanupJob = null;
            console.log('🛑 File Cleanup Service stopped');
        }
    }
    /**
     * Perform the cleanup operation
     */
    performCleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!fs_1.default.existsSync(this.storagePath)) {
                    console.log(`📁 Storage path does not exist: ${this.storagePath}`);
                    return;
                }
                const stats = yield this.cleanupDirectory(this.storagePath);
                // Update tracking statistics
                this.totalFilesDeleted += stats.filesDeleted;
                this.totalDirectoriesDeleted += stats.directoriesDeleted;
                this.lastCleanupTime = new Date();
                console.log(`🧹 Cleanup completed: ${stats.filesDeleted} files and ${stats.directoriesDeleted} directories removed`);
            }
            catch (error) {
                console.error('❌ Error during file cleanup:', error);
            }
        });
    }
    /**
     * Recursively clean up files in a directory
     */
    cleanupDirectory(dirPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = { filesDeleted: 0, directoriesDeleted: 0 };
            try {
                const items = yield fs_1.default.promises.readdir(dirPath);
                for (const item of items) {
                    const itemPath = path_1.default.join(dirPath, item);
                    const stat = yield fs_1.default.promises.stat(itemPath);
                    if (stat.isDirectory()) {
                        // Recursively clean subdirectories
                        const subStats = yield this.cleanupDirectory(itemPath);
                        stats.filesDeleted += subStats.filesDeleted;
                        stats.directoriesDeleted += subStats.directoriesDeleted;
                        // Check if directory is now empty and old enough to delete
                        const dirItems = yield fs_1.default.promises.readdir(itemPath);
                        if (dirItems.length === 0 && this.isOlderThanMaxAge(stat.birthtime)) {
                            yield fs_1.default.promises.rmdir(itemPath);
                            stats.directoriesDeleted++;
                            console.log(`🗑️ Deleted empty directory: ${itemPath}`);
                        }
                    }
                    else if (stat.isFile()) {
                        // Check if file is older than max age
                        if (this.isOlderThanMaxAge(stat.birthtime)) {
                            yield fs_1.default.promises.unlink(itemPath);
                            stats.filesDeleted++;
                            console.log(`🗑️ Deleted old file: ${itemPath}`);
                        }
                    }
                }
            }
            catch (error) {
                console.error(`❌ Error cleaning directory ${dirPath}:`, error);
            }
            return stats;
        });
    }
    /**
     * Check if a file/directory is older than the maximum age
     */
    isOlderThanMaxAge(birthtime) {
        const now = new Date();
        const ageInHours = (now.getTime() - birthtime.getTime()) / (1000 * 60 * 60);
        return ageInHours > this.maxAgeHours;
    }
    /**
     * Get the next scheduled cleanup time
     */
    getNextCleanupTime() {
        if (!this.cleanupJob)
            return null;
        // Calculate next 12-hour interval
        const now = new Date();
        const nextCleanup = new Date(now);
        const hours = now.getHours();
        const nextHour = Math.ceil(hours / 12) * 12;
        if (nextHour >= 24) {
            nextCleanup.setDate(nextCleanup.getDate() + 1);
            nextCleanup.setHours(0, 0, 0, 0);
        }
        else {
            nextCleanup.setHours(nextHour, 0, 0, 0);
        }
        return nextCleanup;
    }
    /**
     * Manually trigger cleanup (useful for testing or administrative purposes)
     */
    manualCleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🧹 Manual cleanup triggered...');
            yield this.performCleanup();
        });
    }
    /**
     * Get the current service status
     */
    getStatus() {
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
    getConfig() {
        return {
            storagePath: this.storagePath,
            maxAgeHours: this.maxAgeHours,
            schedule: '0 */12 * * *',
            timezone: 'UTC',
        };
    }
}
exports.FileCleanupService = FileCleanupService;
// Export singleton instance
exports.fileCleanupService = new FileCleanupService();
//# sourceMappingURL=FileCleanupService.js.map