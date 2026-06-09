import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
import { WEBHOOK_EVENTS } from './Webhooks';

// whatsapp_automated specific config interface
export interface WhatsAppAutomatedConfig {
  phoneNumber: string;
  authInfo?: {
    creds?: any;
    keys?: any;
  };
  qrCode?: string;
  pairingCode?: string;
  // "Reconectado el": set on every successful 'open'. Denormalized for fast
  // card render (the full history lives in ChannelConnectionEvents).
  connectedAt?: Date;
  // "Con problemas desde": stable timestamp set ONCE when the channel first
  // leaves 'active', cleared on the next 'open'. Not overwritten by the retry
  // loop (unlike lastStatusUpdate, which rewrites every ~45s).
  disconnectedSince?: Date | null;
  // Revocation detector: consecutive 401 auth-rejections on fresh sockets.
  // Persisted so the streak survives process restarts and manual /connect
  // calls; cleared on any successful 'open' (a revoked session never opens).
  authRejectionStreak?: number;
  authRejectionStreakStartedAt?: Date | null;
  // Set once channel.disconnected fired for the current outage (once-only guard).
  terminalNotifiedAt?: Date | null;
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

// Telegram Phones specific config interface for call me bot functionality
interface TelegramPhonesConfig {
  botToken: string; // Should be encrypted
  botUsername?: string;
  callMeBotToken?: string; // Token for CallMeBot API integration
  defaultPhoneCountry?: string; // Default country code for phone numbers
}

// Slack specific config interface
export interface SlackConfig {
  botToken: string; // Should be encrypted
  appToken?: string; // Should be encrypted
  signingSecret?: string; // Should be encrypted
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  connectedAt?: Date;
}

// Telegram Ghost Caller specific config interface (MTProto userbot)
export interface TelegramGhostCallerConfig {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  stringSession?: string; // GramJS session string
}

export interface IWebhook extends Document {
  url: string;
  events: string[];
  isActive: boolean;
  // Optional advanced fields — when set, override default JSON-passthrough dispatch.
  // payloadTemplate: raw string with {{var}} placeholders, rendered against the
  // event payload and sent as the request body. Leave empty for the legacy
  // behavior (send the full payload JSON to the URL).
  payloadTemplate?: string;
  // headers: extra headers merged on top of the defaults (Content-Type, X-Event...).
  // Common use: Authorization: Bearer xxx for downstream APIs.
  headers?: Map<string, string>;
  // method: HTTP verb to use. Default POST.
  method?: 'POST' | 'PUT';
  // timezone: IANA tz name used to auto-localize every payload "<key>At" into
  // a sibling "<key>Local". Default 'UTC'.
  timezone?: string;
}

export type ChannelConfig =
  | WhatsAppAutomatedConfig
  | EmailConfig
  | SmsConfig
  | TelegramConfig
  | TelegramPhonesConfig
  | SlackConfig
  | TelegramGhostCallerConfig;

export interface IChannel extends Document {
  channelId: string;
  ownerApiKeyId: mongoose.Types.ObjectId;
  type:
    | 'whatsapp_automated'
    | 'email'
    | 'sms'
    | 'telegram'
    | 'telegram_phones'
    | 'slack'
    | 'telegram_ghost_caller';
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
      enum: [
        'whatsapp_automated',
        'email',
        'sms',
        'telegram',
        'telegram_phones',
        'slack',
        'telegram_ghost_caller',
      ],
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
        'disconnected',
        'error',
        'qr_ready',
        'pairing_code_ready',
        'logged_out',
        // General statuses
        'ready',
        'failed',
        'pending_verification',
        // telegram_ghost_caller specific statuses
        'pending_auth',
        'awaiting_code',
        'awaiting_password',
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
            enum: WEBHOOK_EVENTS,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
          payloadTemplate: {
            type: String,
          },
          headers: {
            type: Map,
            of: String,
          },
          method: {
            type: String,
            enum: ['POST', 'PUT'],
            default: 'POST',
          },
          // IANA timezone (e.g. "America/Lima", "Europe/Madrid"). When set,
          // the dispatcher auto-adds a "<key>Local" sibling for every payload
          // timestamp key ending in "At". Default UTC keeps existing webhooks
          // unchanged (they get xxxAtLocal in UTC too — no breakage).
          timezone: {
            type: String,
            default: 'UTC',
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
