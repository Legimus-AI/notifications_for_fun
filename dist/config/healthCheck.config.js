"use strict";
/**
 * Health Check Configuration
 * Configure CallMeBot recipients for WhatsApp health alerts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEALTH_CHECK_TIMEZONE = exports.HEALTH_CHECK_SCHEDULE = exports.MAX_CONSECUTIVE_ALERTS = exports.CALLMEBOT_RECIPIENTS = void 0;
/**
 * CallMeBot recipients configuration
 * Add multiple phone numbers that should receive health alerts
 */
exports.CALLMEBOT_RECIPIENTS = [
    {
        phone: process.env.CALLMEBOT_PHONE_1 || '51983724476',
        apiKey: process.env.CALLMEBOT_API_KEY_1 || '4189609',
        name: 'Primary Alert Recipient',
    },
    {
        phone: process.env.CALLMEBOT_PHONE_2 || '56950056342',
        apiKey: process.env.CALLMEBOT_API_KEY_2 || '3714473',
        name: 'Secondary Alert Recipient',
    },
];
/**
 * Maximum consecutive alerts before stopping notifications for a channel
 */
exports.MAX_CONSECUTIVE_ALERTS = 3;
/**
 * Health check cron schedule (every 5 minutes)
 */
exports.HEALTH_CHECK_SCHEDULE = '*/5 * * * *';
/**
 * Health check timezone
 */
exports.HEALTH_CHECK_TIMEZONE = 'UTC';
//# sourceMappingURL=healthCheck.config.js.map