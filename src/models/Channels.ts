import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

// whatsapp_automated specific config interface
export interface WhatsAppAutomatedConfig {
  phoneNumber: string;
  authInfo?: {
    creds?: any;
    keys?: any;
  };
  qrCode?: string;
  pairingCode?: string;
  connectedAt?: Date;
}

// Email specific config interface
interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string; // Should be encrypted
  senderEmail: string;
  senderName?: string;
}

// SMS specific config interface
interface SmsConfig {
  provider: 'twilio' | 'nexmo' | 'aws-sns';
  accountSid: string;
  authToken: string; // Should be encrypted
  fromNumber: string;
}

// Telegram specific config interface
interface TelegramConfig {
  botToken: string; // Should be encrypted
  botUsername?: string;
}

export interface IWebhook extends Document {
  url: string;
  events: string[];
  isActive: boolean;
}

export type ChannelConfig =
  | WhatsAppAutomatedConfig
  | EmailConfig
  | SmsConfig
  | TelegramConfig;

export interface IChannel extends Document {
  channelId: string;
  ownerApiKeyId: mongoose.Types.ObjectId;
  type: 'whatsapp_automated' | 'email' | 'sms' | 'telegram';
  name: string;
  config: ChannelConfig;
  status: string;
  lastStatusUpdate: Date;
  isActive: boolean;
  webhooks: IWebhook[];
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema(
  {
    channelId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ownerApiKeyId: {
      type: Schema.Types.ObjectId,
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
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: [
        // whatsapp_automated specific statuses
        'connecting',
        'active',
        'inactive',
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
      new Schema(
        {
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
        },
        {
          versionKey: false,
        },
      ),
    ],
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Compound index for efficient queries
ChannelSchema.index({ ownerApiKeyId: 1, type: 1 });
ChannelSchema.index({ status: 1, isActive: 1 });

ChannelSchema.plugin(mongoosePaginate);

export default mongoose.model<IChannel>('Channel', ChannelSchema);
