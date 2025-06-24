import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

// Notification payload interfaces for different types
interface TextPayload {
  text: string;
}

interface MediaPayload {
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  caption?: string;
  filename?: string;
}

interface EmailPayload {
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    url: string;
  }>;
}

export type NotificationPayload = TextPayload | MediaPayload | EmailPayload;

export interface INotification extends Document {
  ownerApiKeyId: mongoose.Types.ObjectId;
  channelId: mongoose.Types.ObjectId;
  type: 'outgoing' | 'incoming' | 'delivery_report';
  channelType: 'whatsapp_automated' | 'email' | 'sms' | 'telegram';
  externalMessageId?: string;
  to: string;
  from: string;
  payload: NotificationPayload;
  status: string;
  statusDetails?: string;
  timestamp: Date;
  deliveredAt?: Date;
  readAt?: Date;
  errorCount: number;
  lastErrorAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema(
  {
    ownerApiKeyId: {
      type: Schema.Types.ObjectId,
      ref: 'ApiKey',
      required: true,
      index: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
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
      type: Schema.Types.Mixed,
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
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Compound indexes for efficient queries
NotificationSchema.index({ ownerApiKeyId: 1, channelId: 1 });
NotificationSchema.index(
  { channelType: 1, externalMessageId: 1 },
  { unique: true, sparse: true },
);
NotificationSchema.index({ status: 1, timestamp: -1 });
NotificationSchema.index({ to: 1, timestamp: -1 });
NotificationSchema.index({ type: 1, channelType: 1 });

NotificationSchema.plugin(mongoosePaginate);

export default mongoose.model<INotification>(
  'NotificationLog',
  NotificationSchema,
);
