import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

/**
 * Durable audit trail of WhatsApp channel connection-state transitions.
 * One row per open/close/reconnect/logged_out/conflict event. Survives process
 * restarts so incidents are diagnosable without grepping multi-GB pm2 logs.
 */
export interface IChannelConnectionEvent extends Document {
  channelId: string;
  event: string; // open | close | reconnect | conflict | logged_out
  statusCode?: number;
  reason?: string;
  message?: string;
  attempt?: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema(
  {
    channelId: { type: String, required: true, index: true },
    event: { type: String, required: true, index: true },
    statusCode: { type: Number },
    reason: { type: String },
    message: { type: String },
    attempt: { type: Number },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// TTL: auto-purge after 30 days. Keeps the collection bounded — this is an audit
// trail, not permanent storage.
schema.index({ createdAt: 1 }, { expireAfterSeconds: 2_592_000 });

schema.plugin(mongoosePaginate);

export default mongoose.model<IChannelConnectionEvent>(
  'ChannelConnectionEvents',
  schema,
);
