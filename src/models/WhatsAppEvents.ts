import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

export interface IWhatsAppEvent extends Document {
  channelId: mongoose.Types.ObjectId;
  payload: any;
  isLid: boolean;
  isUnresolvedLid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema(
  {
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    isLid: {
      type: Boolean,
      default: false,
      index: true,
    },
    isUnresolvedLid: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

// Compound index for efficient message lookup by channel and message ID (used for replies)
schema.index({ channelId: 1, 'payload.key.id': 1 });

schema.plugin(mongoosePaginate);

export default mongoose.model<IWhatsAppEvent>('WhatsAppEvents', schema);
