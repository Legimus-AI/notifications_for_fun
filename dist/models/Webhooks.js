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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const mongoose_paginate_v2_1 = __importDefault(require("mongoose-paginate-v2"));
const WebhookSchema = new mongoose_1.Schema({
    ownerApiKeyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ApiKey',
        required: true,
        index: true,
    },
    url: {
        type: String,
        required: true,
        validate: {
            validator: function (v) {
                return /^https?:\/\/.+/.test(v);
            },
            message: 'URL must be a valid HTTP/HTTPS URL',
        },
    },
    events: {
        type: [String],
        required: true,
        enum: [
            // Channel events
            'channel.status_update',
            'channel.connected',
            'channel.disconnected',
            'channel.qr_ready',
            'channel.pairing_code_ready',
            'channel.error',
            // Notification events
            'notification.sent',
            'notification.delivered',
            'notification.read',
            'notification.failed',
            'notification.received',
            // System events
            'system.health_check',
            'api_key.rate_limit_exceeded',
        ],
        validate: {
            validator: function (v) {
                return v && v.length > 0;
            },
            message: 'At least one event must be specified',
        },
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    signatureSecret: {
        type: String,
        required: true,
    },
    lastTriggeredAt: {
        type: Date,
    },
    failureCount: {
        type: Number,
        default: 0,
    },
    lastFailureAt: {
        type: Date,
    },
    lastFailureReason: {
        type: String,
    },
}, {
    versionKey: false,
    timestamps: true,
});
// Compound indexes for efficient queries
WebhookSchema.index({ ownerApiKeyId: 1, isActive: 1 });
WebhookSchema.index({ events: 1, isActive: 1 });
WebhookSchema.plugin(mongoose_paginate_v2_1.default);
exports.default = mongoose_1.default.model('Webhook', WebhookSchema);
//# sourceMappingURL=Webhooks.js.map