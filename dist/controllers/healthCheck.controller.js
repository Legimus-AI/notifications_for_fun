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
Object.defineProperty(exports, "__esModule", { value: true });
const WhatsAppHealthCheckCron_1 = require("../cronjobs/WhatsAppHealthCheckCron");
const utils = __importStar(require("../helpers/utils"));
/**
 * Controller for WhatsApp Health Check
 */
class HealthCheckController {
    constructor() {
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
        this.checkWhatsAppHealth = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('🔍 Manual health check requested via API');
                // Run health check
                const result = yield (0, WhatsAppHealthCheckCron_1.manualHealthCheck)();
                // Helper function to get human-readable status
                const getStatusDescription = (status) => {
                    const statusMap = {
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
                    return (statusMap[normalizedStatus] ||
                        statusMap[status] ||
                        status
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (l) => l.toUpperCase()));
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
                console.log(`✅ Manual health check completed: ${result.healthy.length} healthy, ${result.unhealthy.length} affected`);
                res.status(200).json(response);
            }
            catch (error) {
                console.error('❌ Error in manual health check:', error);
                utils.handleError(res, error);
            }
        });
        /**
         * Get health check status for all phone numbers
         * GET /api/health_check/status
         * Same as /whatsapp endpoint - returns health status of all channels
         */
        this.getHealthCheckStatus = (req, res) => __awaiter(this, void 0, void 0, function* () {
            // This endpoint does the same as checkWhatsAppHealth
            // Just a shorter alias for convenience
            return this.checkWhatsAppHealth(req, res);
        });
    }
}
exports.default = new HealthCheckController();
//# sourceMappingURL=healthCheck.controller.js.map