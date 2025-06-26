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
const NotificationSchema = new mongoose_1.Schema({
    ownerApiKeyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ApiKey',
        required: true,
        index: true,
    },
    channelId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Channel',
        required: true,
        index: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['outgoing', 'incoming', 'delivery_report'],
    },
    channelType: {
        type: String,
        required: true,
        enum: ['whatsapp_automated', 'email', 'sms', 'telegram'],
    },
    externalMessageId: {
        type: String,
        sparse: true, // Allows multiple null values
    },
    to: {
        type: String,
        required: true,
    },
    from: {
        type: String,
        required: true,
    },
    payload: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
    status: {
        type: String,
        required: true,
        enum: [
            'queued',
            'sent',
            'delivered',
            'read',
            'failed',
            'received',
            'processing',
            'cancelled',
        ],
        default: 'queued',
    },
    statusDetails: {
        type: String,
    },
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
    },
    deliveredAt: {
        type: Date,
    },
    readAt: {
        type: Date,
    },
    errorCount: {
        type: Number,
        default: 0,
    },
    lastErrorAt: {
        type: Date,
    },
}, {
    versionKey: false,
    timestamps: true,
});
// Compound indexes for efficient queries
NotificationSchema.index({ ownerApiKeyId: 1, channelId: 1 });
NotificationSchema.index({ channelType: 1, externalMessageId: 1 }, { unique: true, sparse: true });
NotificationSchema.index({ status: 1, timestamp: -1 });
NotificationSchema.index({ to: 1, timestamp: -1 });
NotificationSchema.index({ type: 1, channelType: 1 });
NotificationSchema.plugin(mongoose_paginate_v2_1.default);
exports.default = mongoose_1.default.model('NotificationLog', NotificationSchema);
//# sourceMappingURL=NotificationLogs.js.map