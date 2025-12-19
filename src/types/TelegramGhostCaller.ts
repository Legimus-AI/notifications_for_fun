export interface TelegramGhostCallerConfig {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  stringSession?: string;
  password2FA?: string; // Optional 2FA password
}

export interface TelegramGhostCallerMessage {
  recipient: string; // Username or phone number
  text: string;
}

export interface TelegramGhostCallerMessageResponse {
  success: boolean;
  messageId?: number;
  date?: number;
  error?: string;
}

export interface TelegramGhostCallerCallRequest {
  recipient: string; // Username or phone number to call
  wakeUpMessage?: string; // Optional message to send before call (wakes up iOS)
}

export interface TelegramGhostCallerCallResponse {
  success: boolean;
  status: 'initiated' | 'privacy_restricted' | 'user_not_found' | 'error';
  message?: string;
  wakeUpMessageSent?: boolean;
}

export interface TelegramGhostCallerSessionRequest {
  phoneCode: string;
  password?: string;
}

export interface TelegramGhostCallerSessionResponse {
  success: boolean;
  status: 'awaiting_code' | 'awaiting_password' | 'connected' | 'error';
  stringSession?: string;
  message?: string;
}
