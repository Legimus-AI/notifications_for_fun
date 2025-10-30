import mongoose, { Schema, Document } from 'mongoose';

export interface ISlackEvent extends Document {
  channelId: string;
  eventType: string;
  payload: any;
  createdAt: Date;
  updatedAt: Date;
}

const SlackEventSchema = new Schema(
  {
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'message',
        'message.channels',
        'message.groups',
        'message.im',
        'message.mpim',
        'app_mention',
        'reaction_added',
        'reaction_removed',
        'team_join',
        'user_change',
        'channel_created',
        'channel_deleted',
        'channel_archive',
        'channel_unarchive',
        'other',
      ],
      default: 'other',
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

// Compound indexes for efficient queries
SlackEventSchema.index({ channelId: 1, createdAt: -1 });
SlackEventSchema.index({ channelId: 1, eventType: 1, createdAt: -1 });

// TTL index to automatically delete old events after 30 days
SlackEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.model<ISlackEvent>('SlackEvent', SlackEventSchema);

