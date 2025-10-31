export interface TelegramPhonesConfig {
  botToken: string;
  botUsername?: string;
  callMeBotToken?: string;
  defaultPhoneCountry?: string;
}

export interface TelegramPhonesMessage {
  chat_id: string | number;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
  reply_markup?: TelegramPhonesInlineKeyboard | TelegramPhonesReplyKeyboard;
}

export interface TelegramPhonesCallRequest {
  phone: string; // Phone number to call
  message?: string; // Optional message to send with the call
  language?: string; // Language for the call (e.g., 'en-US', 'es-ES')
}

export interface TelegramPhonesCallResponse {
  success: boolean;
  callId?: string;
  status: string;
  message?: string;
}

export interface TelegramPhonesInlineKeyboard {
  inline_keyboard: TelegramPhonesInlineKeyboardButton[][];
}

export interface TelegramPhonesReplyKeyboard {
  keyboard: TelegramPhonesKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export interface TelegramPhonesInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: {
    url: string;
  };
  login_url?: {
    url: string;
  };
}

export interface TelegramPhonesKeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
  request_poll?: {
    type?: 'quiz' | 'regular';
  };
}

export interface TelegramPhonesMessageResponse {
  ok: boolean;
  result: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: 'private' | 'group' | 'supergroup' | 'channel';
    };
    date: number;
    text?: string;
  };
  error_code?: number;
  description?: string;
}
