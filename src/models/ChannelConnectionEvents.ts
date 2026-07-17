import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

/**
 * Durable audit trail of WhatsApp channel connection-state transitions.
 * One row per connection-state event, including terminal logout and auth pause.
 * Survives restarts so incidents are diagnosable without multi-GB PM2 logs.
 */
export interface IChannelConnectionEvent extends Document {
  channelId: string;
  event: string;
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
