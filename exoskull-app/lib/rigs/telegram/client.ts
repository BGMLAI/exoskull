// =====================================================
// TELEGRAM BOT CLIENT
// Bot API: https://core.telegram.org/bots/api
// =====================================================

import { RigConnection, RigSyncResult } from '../types';

// =====================================================
// TYPES
// =====================================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  document?: TelegramDocument;
  location?: TelegramLocation;
  reply_to_message?: TelegramMessage;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramLocation {
  longitude: number;
  latitude: number;
  horizontal_accuracy?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: { text: string }[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
}

export type ReplyMarkup = InlineKeyboardMarkup | ReplyKeyboardMarkup | { remove_keyboard: true };

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  reply_markup?: ReplyMarkup;
  reply_to_message_id?: number;
  disable_notification?: boolean;
  protect_content?: boolean;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

// =====================================================
// CLIENT
// =====================================================

export class TelegramClient {
  private botToken: string;
  private baseUrl: string;

  constructor(botToken: string) {
    this.botToken = botToken;
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  private async fetch<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: params ? JSON.stringify(params) : undefined,
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('[TelegramClient] API error:', {
        method,
        error_code: data.error_code,
        description: data.description,
      });
      throw new Error(`Telegram API error: ${data.description}`);
    }

    return data.result;
  }

  // =====================================================
  // BOT INFO
  // =====================================================

  async getMe(): Promise<TelegramBotInfo> {
    return this.fetch('getMe');
  }

  // =====================================================
  // MESSAGES
  // =====================================================

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    return this.fetch('sendMessage', {
      chat_id: chatId,
      text,
      ...options,
    });
  }

  async sendPhoto(
    chatId: number | string,
    photo: string, // file_id or URL
    caption?: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    return this.fetch('sendPhoto', {
      chat_id: chatId,
      photo,
      caption,
      ...options,
    });
  }

  async sendVoice(
    chatId: number | string,
    voice: string, // file_id or URL
    caption?: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    return this.fetch('sendVoice', {
      chat_id: chatId,
      voice,
      caption,
      ...options,
    });
  }

  async sendDocument(
    chatId: number | string,
    document: string, // file_id or URL
    caption?: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage> {
    return this.fetch('sendDocument', {
      chat_id: chatId,
      document,
      caption,
      ...options,
    });
  }

  async sendLocation(
    chatId: number | string,
    latitude: number,
    longitude: number,
    options?: Omit<SendMessageOptions, 'parse_mode'>
  ): Promise<TelegramMessage> {
    return this.fetch('sendLocation', {
      chat_id: chatId,
      latitude,
      longitude,
      ...options,
    });
  }

  async forwardMessage(
    chatId: number | string,
    fromChatId: number | string,
    messageId: number
  ): Promise<TelegramMessage> {
    return this.fetch('forwardMessage', {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    });
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage | boolean> {
    return this.fetch('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    });
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    return this.fetch('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  }

  // =====================================================
  // CALLBACKS
  // =====================================================

  async answerCallbackQuery(
    callbackQueryId: string,
    options?: {
      text?: string;
      show_alert?: boolean;
      url?: string;
      cache_time?: number;
    }
  ): Promise<boolean> {
    return this.fetch('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...options,
    });
  }

  // =====================================================
  // CHAT ACTIONS
  // =====================================================

  async sendChatAction(
    chatId: number | string,
    action:
      | 'typing'
      | 'upload_photo'
      | 'record_video'
      | 'upload_video'
      | 'record_voice'
      | 'upload_voice'
      | 'upload_document'
      | 'find_location'
      | 'record_video_note'
      | 'upload_video_note'
  ): Promise<boolean> {
    return this.fetch('sendChatAction', {
      chat_id: chatId,
      action,
    });
  }

  async getChat(chatId: number | string): Promise<TelegramChat> {
    return this.fetch('getChat', {
      chat_id: chatId,
    });
  }

  // =====================================================
  // FILES
  // =====================================================

  async getFile(fileId: string): Promise<TelegramFile> {
    return this.fetch('getFile', {
      file_id: fileId,
    });
  }

  getFileUrl(filePath: string): string {
    return `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const file = await this.getFile(fileId);
    if (!file.file_path) {
      throw new Error('File path not available');
    }

    const url = this.getFileUrl(file.file_path);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  // =====================================================
  // WEBHOOKS
  // =====================================================

  async setWebhook(
    url: string,
    options?: {
      certificate?: string;
      ip_address?: string;
      max_connections?: number;
      allowed_updates?: string[];
      drop_pending_updates?: boolean;
      secret_token?: string;
    }
  ): Promise<boolean> {
    return this.fetch('setWebhook', {
      url,
      ...options,
    });
  }

  async deleteWebhook(dropPendingUpdates?: boolean): Promise<boolean> {
    return this.fetch('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  async getWebhookInfo(): Promise<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    allowed_updates?: string[];
  }> {
    return this.fetch('getWebhookInfo');
  }

  // =====================================================
  // UPDATES (Long polling - for development)
  // =====================================================

  async getUpdates(options?: {
    offset?: number;
    limit?: number;
    timeout?: number;
    allowed_updates?: string[];
  }): Promise<TelegramUpdate[]> {
    return this.fetch('getUpdates', options);
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Send a message with quick reply buttons
   */
  async sendQuickReply(
    chatId: number | string,
    text: string,
    buttons: { text: string; callbackData: string }[]
  ): Promise<TelegramMessage> {
    const keyboard: InlineKeyboardButton[][] = buttons.map((btn) => [
      { text: btn.text, callback_data: btn.callbackData },
    ]);

    return this.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Send a message with inline URL buttons
   */
  async sendWithLinks(
    chatId: number | string,
    text: string,
    links: { text: string; url: string }[]
  ): Promise<TelegramMessage> {
    const keyboard: InlineKeyboardButton[][] = links.map((link) => [
      { text: link.text, url: link.url },
    ]);

    return this.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Send typing indicator for better UX
   */
  async sendTyping(chatId: number | string): Promise<boolean> {
    return this.sendChatAction(chatId, 'typing');
  }

  /**
   * Send a formatted message with HTML
   */
  async sendHTML(
    chatId: number | string,
    html: string,
    options?: Omit<SendMessageOptions, 'parse_mode'>
  ): Promise<TelegramMessage> {
    return this.sendMessage(chatId, html, {
      ...options,
      parse_mode: 'HTML',
    });
  }

  /**
   * Send an ExoSkull notification
   */
  async sendNotification(
    chatId: number | string,
    title: string,
    body: string,
    actions?: { text: string; callbackData: string }[]
  ): Promise<TelegramMessage> {
    const html = `<b>${this.escapeHTML(title)}</b>\n\n${this.escapeHTML(body)}`;

    if (actions && actions.length > 0) {
      return this.sendQuickReply(chatId, html, actions);
    }

    return this.sendHTML(chatId, html);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// =====================================================
// SYNC FUNCTION
// =====================================================

export async function syncTelegramData(
  connection: RigConnection
): Promise<RigSyncResult> {
  try {
    // Telegram uses bot token, not OAuth access token
    const botToken = connection.metadata?.bot_token as string;
    if (!botToken) {
      return { success: false, records_synced: 0, error: 'No bot token configured' };
    }

    const client = new TelegramClient(botToken);

    // Verify bot is working
    const botInfo = await client.getMe();
    const webhookInfo = await client.getWebhookInfo();

    return {
      success: true,
      records_synced: webhookInfo.pending_update_count,
      data_range: {
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[Telegram] Sync error:', error);
    return {
      success: false,
      records_synced: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =====================================================
// FACTORY
// =====================================================

export function createTelegramClient(connection: RigConnection): TelegramClient | null {
  const botToken = connection.metadata?.bot_token as string;
  if (!botToken) return null;
  return new TelegramClient(botToken);
}

// Create client from env (for system notifications)
export function createSystemTelegramClient(): TelegramClient | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;
  return new TelegramClient(botToken);
}
