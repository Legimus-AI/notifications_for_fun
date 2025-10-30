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
Object.defineProperty(exports, "__esModule", { value: true });
const express_validator_1 = require("express-validator");
const FileCleanupService_1 = require("../services/api/FileCleanupService");
/**
 * Controller for file cleanup service management
 */
class FileCleanupController {
    constructor() {
        /**
         * Get cleanup service status
         */
        this.getStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const status = FileCleanupService_1.fileCleanupService.getStatus();
                const config = FileCleanupService_1.fileCleanupService.getConfig();
                res.status(200).json({
                    success: true,
                    data: {
                        status,
                        config,
                    },
                });
            }
            catch (error) {
                console.error('Error getting cleanup service status:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to get cleanup service status',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        /**
         * Manually trigger cleanup
         */
        this.triggerCleanup = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                // Check for validation errors
                const errors = (0, express_validator_1.validationResult)(req);
                if (!errors.isEmpty()) {
                    res.status(400).json({
                        success: false,
                        message: 'Validation failed',
                        errors: errors.array(),
                    });
                    return;
                }
                yield FileCleanupService_1.fileCleanupService.manualCleanup();
                const status = FileCleanupService_1.fileCleanupService.getStatus();
                res.status(200).json({
                    success: true,
                    message: 'Cleanup completed successfully',
                    data: status,
                });
            }
            catch (error) {
                console.error('Error triggering manual cleanup:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to trigger cleanup',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        /**
         * Get cleanup configuration
         */
        this.getConfig = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const config = FileCleanupService_1.fileCleanupService.getConfig();
                res.status(200).json({
                    success: true,
                    data: config,
                });
            }
            catch (error) {
                console.error('Error getting cleanup configuration:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to get cleanup configuration',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
        /**
         * Get cleanup service health check
         */
        this.healthCheck = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const status = FileCleanupService_1.fileCleanupService.getStatus();
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
            }
            catch (error) {
                console.error('Error checking cleanup service health:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to check cleanup service health',
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        });
    }
}
exports.default = new FileCleanupController();
//# sourceMappingURL=fileCleanup.controller.js.map