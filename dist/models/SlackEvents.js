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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const SlackEventSchema = new mongoose_1.Schema({
    channelId: {
        type: String,
        required: true,
        index: true,
    },
    eventType: {
        type: String,
        required: true,
        enum: [
            'message',
            'message.channels',
            'message.groups',
            'message.im',
            'message.mpim',
            'app_mention',
            'reaction_added',
            'reaction_removed',
            'team_join',
            'user_change',
            'channel_created',
            'channel_deleted',
            'channel_archive',
            'channel_unarchive',
            'other',
        ],
        default: 'other',
    },
    payload: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
}, {
    versionKey: false,
    timestamps: true,
});
// Compound indexes for efficient queries
SlackEventSchema.index({ channelId: 1, createdAt: -1 });
SlackEventSchema.index({ channelId: 1, eventType: 1, createdAt: -1 });
// TTL index to automatically delete old events after 30 days
SlackEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
exports.default = mongoose_1.default.model('SlackEvent', SlackEventSchema);
//# sourceMappingURL=SlackEvents.js.map