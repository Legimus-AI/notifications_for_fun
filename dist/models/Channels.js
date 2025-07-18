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
const ChannelSchema = new mongoose_1.Schema({
    channelId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    ownerApiKeyId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ApiKey',
        required: true,
        index: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['whatsapp_automated', 'email', 'sms', 'telegram'],
        index: true,
    },
    name: {
        type: String,
        required: true,
    },
    config: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
    status: {
        type: String,
        enum: [
            // whatsapp_automated specific statuses
            'connecting',
            'active',
            'inactive',
            'disconnected',
            'error',
            'qr_ready',
            'pairing_code_ready',
            'logged_out',
            // General statuses
            'ready',
            'failed',
            'pending_verification',
        ],
        default: 'inactive',
    },
    lastStatusUpdate: {
        type: Date,
        default: Date.now,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    webhooks: [
        new mongoose_1.Schema({
            url: {
                type: String,
                required: true,
            },
            events: {
                type: [String],
                required: true,
                enum: [
                    'message.received',
                    'message.sent',
                    'message.delivered',
                    'message.read',
                ],
            },
            isActive: {
                type: Boolean,
                default: true,
            },
        }, {
            versionKey: false,
        }),
    ],
}, {
    versionKey: false,
    timestamps: true,
});
// Compound index for efficient queries
ChannelSchema.index({ ownerApiKeyId: 1, type: 1 });
ChannelSchema.index({ status: 1, isActive: 1 });
ChannelSchema.plugin(mongoose_paginate_v2_1.default);
exports.default = mongoose_1.default.model('Channel', ChannelSchema);
//# sourceMappingURL=Channels.js.map