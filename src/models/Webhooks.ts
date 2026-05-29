import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

// Single source of truth for webhook event names. Imported by Channels.ts
// (sub-schema enum) and the controller (validation). Adding a new event here
// makes it available everywhere — no parallel lists to keep in sync.
export const WEBHOOK_EVENTS = [
  // Channel events
  'channel.status_update',
  'channel.connected',
  'channel.disconnected',
  'channel.qr_ready',
  'channel.pairing_code_ready',
  'channel.error',
  'channel.credentials_changed',
  // Notification events
  'notification.sent',
  'notification.delivered',
  'notification.read',
  'notification.failed',
  'notification.received',
  // System events
  'system.health_check',
  'api_key.rate_limit_exceeded',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

export interface IWebhook extends Document {
  ownerApiKeyId: mongoose.Types.ObjectId;
  url: string;
  events: string[];
  isActive: boolean;
  signatureSecret: string;
  lastTriggeredAt?: Date;
  failureCount: number;
  lastFailureAt?: Date;
  lastFailureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema(
  {
    ownerApiKeyId: {
      type: Schema.Types.ObjectId,
      ref: 'ApiKey',
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'URL must be a valid HTTP/HTTPS URL',
      },
    },
    events: {
      type: [String],
      required: true,
      enum: WEBHOOK_EVENTS,
      validate: {
        validator: function (v: string[]) {
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
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Compound indexes for efficient queries
WebhookSchema.index({ ownerApiKeyId: 1, isActive: 1 });
WebhookSchema.index({ events: 1, isActive: 1 });

WebhookSchema.plugin(mongoosePaginate);

export default mongoose.model<IWebhook>('Webhook', WebhookSchema);
