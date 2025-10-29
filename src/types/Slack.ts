export interface SlackConfig {
  botToken: string;
  appToken?: string;
  signingSecret?: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  connectedAt?: Date;
}

export interface SlackMessage {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  thread_ts?: string;
  reply_broadcast?: boolean;
}

export interface SlackMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message: {
    text: string;
    user: string;
    ts: string;
    type: string;
  };
  error?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    image_512?: string;
  };
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  created: number;
  creator: string;
  is_archived: boolean;
  is_general: boolean;
  members?: string[];
  topic?: {
    value: string;
    creator: string;
    last_set: number;
  };
  purpose?: {
    value: string;
    creator: string;
    last_set: number;
  };
}

export interface SlackWebhookPayload {
  object: 'slack';
  entry: {
    id: string;
    time: number;
    messaging: Array<{
      event_type: string;
      event: any;
    }>;
  }[];
}

