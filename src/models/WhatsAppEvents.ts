import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

export interface IWhatsAppEvent extends Document {
  channelId: mongoose.Types.ObjectId;
  payload: any;
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
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

schema.plugin(mongoosePaginate);

export default mongoose.model<IWhatsAppEvent>('WhatsAppEvents', schema);
