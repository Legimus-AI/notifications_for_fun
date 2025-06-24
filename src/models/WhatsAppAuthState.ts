import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsAppAuthState extends Document {
  channelId: string; // Reference to the channel
  creds: any; // WhatsApp credentials
  keys: Map<string, any>; // Signal protocol keys
  createdAt: Date;
  updatedAt: Date;
}

export interface IWhatsAppAuthKey extends Document {
  channelId: string;
  keyId: string;
  keyData: any;
  createdAt: Date;
  updatedAt: Date;
}

// Schema for storing main auth credentials
const WhatsAppAuthStateSchema = new Schema(
  {
    channelId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    creds: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Schema for storing individual keys (for better performance)
const WhatsAppAuthKeySchema = new Schema(
  {
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    keyId: {
      type: String,
      required: true,
    },
    keyData: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Compound index for efficient key lookups
WhatsAppAuthKeySchema.index({ channelId: 1, keyId: 1 }, { unique: true });

export const WhatsAppAuthState = mongoose.model<IWhatsAppAuthState>(
  'WhatsAppAuthState',
  WhatsAppAuthStateSchema,
);
export const WhatsAppAuthKey = mongoose.model<IWhatsAppAuthKey>(
  'WhatsAppAuthKey',
  WhatsAppAuthKeySchema,
);

export default { WhatsAppAuthState, WhatsAppAuthKey };
