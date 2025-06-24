import mongoose, { Schema, Document } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

export interface IApiKey extends Document {
  key: string;
  name: string;
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    permissions: {
      type: [String],
      default: [],
      enum: [
        'channel:manage',
        'notification:send',
        'webhook:manage',
        'notification:read',
        'channel:read',
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  },
);

ApiKeySchema.plugin(mongoosePaginate);

export default mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
