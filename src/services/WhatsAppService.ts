import makeWASocket, {
  WASocket,
  ConnectionState,
  DisconnectReason,
  AuthenticationState,
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  Browsers,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import {
  WhatsAppAuthState,
  WhatsAppAuthKey,
} from '../models/WhatsAppAuthState';
import Channel from '../models/Channels';
import { EventEmitter } from 'events';

export interface WhatsAppServiceEvents {
  qr: (channelId: string, qr: string) => void;
  'pairing-code': (channelId: string, code: string) => void;
  'connection-update': (
    channelId: string,
    status: string,
    lastDisconnect?: any,
  ) => void;
  message: (channelId: string, message: any) => void;
  'message-status': (channelId: string, status: any) => void;
}

export class WhatsAppService extends EventEmitter {
  private connections: Map<string, WASocket> = new Map();
  private connectionStatus: Map<string, string> = new Map();

  constructor() {
    super();
  }

  /**
   * Restores all active channels on server restart
   */
  async restoreActiveChannels(): Promise<void> {
    try {
      console.log('🔄 Restoring active WhatsApp channels...');

      // Find all channels that were active before server restart
      const activeChannels = await Channel.find({
        type: 'whatsapp_automated',
        status: {
          $in: ['active', 'connecting', 'qr_ready', 'pairing_code_ready'],
        },
        isActive: true,
      });

      console.log(`📱 Found ${activeChannels.length} channels to restore`);

      // Reconnect each channel with staggered delays
      for (let i = 0; i < activeChannels.length; i++) {
        const channel = activeChannels[i];

        try {
          console.log(
            `🔄 Restoring channel: ${channel.channelId} (${channel.name})`,
          );

          // Reset status to connecting for restoration
          await this.updateChannelStatus(channel.channelId, 'connecting');

          // Set initial memory status
          this.connectionStatus.set(channel.channelId, 'connecting');

          // Attempt to reconnect
          await this.connectChannel(channel.channelId);

          // Add delay between connections to avoid overwhelming
          if (i < activeChannels.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          }
        } catch (error) {
          console.error(
            `❌ Failed to restore channel ${channel.channelId}:`,
            error,
          );
          await this.updateChannelStatus(channel.channelId, 'error');
        }
      }
      console.log('✅ Channel restoration completed');
    } catch (error) {
      console.error('❌ Error during channel restoration:', error);
    }
  }

  /**
   * Converts MongoDB Binary objects back to Node.js Buffers
   */
  private convertBinaryToBuffer(obj: any): any {
    if (!obj) return obj;

    if (obj && typeof obj === 'object') {
      // Handle MongoDB Binary type
      if (obj._bsontype === 'Binary' && obj.buffer) {
        return Buffer.from(obj.buffer);
      }

      // Handle Uint8Array
      if (obj instanceof Uint8Array) {
        return Buffer.from(obj);
      }

      // Recursively convert nested objects
      if (Array.isArray(obj)) {
        return obj.map((item) => this.convertBinaryToBuffer(item));
      }

      // Handle regular objects
      const converted: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          converted[key] = this.convertBinaryToBuffer(obj[key]);
        }
      }
      return converted;
    }

    return obj;
  }

  /**
   * Creates MongoDB-based auth state for production use
   */
  private async createMongoAuthState(
    channelId: string,
  ): Promise<AuthenticationState> {
    // Try to load existing creds
    let authState = await WhatsAppAuthState.findOne({ channelId });
    let creds: AuthenticationCreds;

    if (authState) {
      // Convert MongoDB Binary objects back to Buffers
      creds = this.convertBinaryToBuffer(authState.creds);
    } else {
      // Initialize new credentials
      creds = initAuthCreds();
      authState = new WhatsAppAuthState({
        channelId,
        creds,
      });
      await authState.save();
    }

    // Load existing keys
    const existingKeys = await WhatsAppAuthKey.find({ channelId });
    const keys = new Map<string, any>();

    existingKeys.forEach((keyDoc) => {
      // Convert Binary objects back to Buffers for each key
      const convertedKeyData = this.convertBinaryToBuffer(keyDoc.keyData);
      keys.set(keyDoc.keyId, convertedKeyData);
    });

    return {
      creds,
      keys: {
        get: (type: string, ids: string[]) => {
          const result: { [id: string]: any } = {};
          ids.forEach((id) => {
            const key = keys.get(`${type}:${id}`);
            if (key) result[id] = key;
          });
          return result;
        },
        set: async (data: any) => {
          const promises: Promise<any>[] = [];

          for (const category in data) {
            for (const id in data[category]) {
              const keyId = `${category}:${id}`;
              const keyData = data[category][id];

              keys.set(keyId, keyData);

              promises.push(
                WhatsAppAuthKey.findOneAndUpdate(
                  { channelId, keyId },
                  { keyData },
                  { upsert: true, new: true },
                ),
              );
            }
          }

          await Promise.all(promises);
        },
      },
    };
  }

  /**
   * Saves updated credentials to MongoDB
   */
  private async saveCreds(channelId: string, creds: AuthenticationCreds) {
    // Check if channel still exists before saving credentials
    if (!this.connections.has(channelId)) {
      console.log(
        `⚠️ Ignoring credential save for deleted channel: ${channelId}`,
      );
      return;
    }

    await WhatsAppAuthState.findOneAndUpdate(
      { channelId },
      { creds },
      { upsert: true, new: true },
    );
  }

  /**
   * Connects or reconnects a WhatsApp channel
   */
  async connectChannel(channelId: string, phoneNumber?: string): Promise<void> {
    try {
      console.log(`🔄 Connecting WhatsApp channel: ${channelId}`);

      // Update channel status
      await this.updateChannelStatus(channelId, 'connecting');

      // For new connections, clear existing auth state to avoid Binary conversion issues
      const existingAuth = await WhatsAppAuthState.findOne({ channelId });
      if (!existingAuth) {
        console.log(
          `🆕 Creating fresh auth state for new channel: ${channelId}`,
        );
      }

      // Create auth state
      const auth = await this.createMongoAuthState(channelId);

      // Create socket
      const sock = makeWASocket({
        auth,
        browser: Browsers.ubuntu('Multi-Channel Notifications'),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 60000,
        // getMessage: async (key) => {
        //   // Implement message retrieval from your database
        //   return null;
        // },
      });

      // Store connection
      this.connections.set(channelId, sock);
      this.connectionStatus.set(channelId, 'connecting');

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(channelId, update, phoneNumber);
      });

      // Handle credential updates
      sock.ev.on('creds.update', async () => {
        await this.saveCreds(channelId, auth.creds);
      });

      // Handle incoming messages
      sock.ev.on('messages.upsert', async (m) => {
        await this.handleIncomingMessages(channelId, m);
      });

      // Handle message status updates
      sock.ev.on('messages.update', async (updates) => {
        await this.handleMessageStatusUpdates(channelId, updates);
      });

      // Handle groups update for metadata caching
      sock.ev.on('groups.update', async (updates) => {
        // Implement group metadata caching if needed
        console.log('Groups updated:', updates);
      });
    } catch (error) {
      console.error(`❌ Error connecting channel ${channelId}:`, error);
      await this.updateChannelStatus(channelId, 'error');
      this.emit('connection-update', channelId, 'error', error);
    }
  }

  /**
   * Handles connection status updates
   */
  private async handleConnectionUpdate(
    channelId: string,
    update: Partial<ConnectionState>,
    phoneNumber?: string,
  ) {
    // Check if channel still exists before processing events
    if (!this.connections.has(channelId)) {
      console.log(
        `⚠️ Ignoring connection update for deleted channel: ${channelId}`,
      );
      return;
    }

    const { connection, lastDisconnect, qr } = update;

    console.log(`📱 Connection update for ${channelId}:`, {
      connection,
      qr: !!qr,
    });

    if (qr) {
      // Generate QR code
      const qrDataURL = await QRCode.toDataURL(qr);
      await this.updateChannelStatus(channelId, 'qr_ready');
      this.emit('qr', channelId, qrDataURL);
    }

    if (connection === 'connecting' && phoneNumber) {
      // Request pairing code if phone number provided
      try {
        const sock = this.connections.get(channelId);
        if (sock && !sock.authState.creds.registered) {
          const code = await sock.requestPairingCode(phoneNumber);
          await this.updateChannelStatus(channelId, 'pairing_code_ready');
          this.emit('pairing-code', channelId, code);
        }
      } catch (error) {
        console.error(
          `❌ Error requesting pairing code for ${channelId}:`,
          error,
        );
      }
    }

    if (connection === 'close') {
      this.connections.delete(channelId);

      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(`🔄 Reconnecting ${channelId}...`);
        await this.updateChannelStatus(channelId, 'connecting');
        // Reconnect after 5 seconds
        setTimeout(() => this.connectChannel(channelId, phoneNumber), 5000);
      } else {
        console.log(`🚪 ${channelId} logged out`);
        await this.updateChannelStatus(channelId, 'logged_out');
      }
    }

    if (connection === 'open') {
      console.log(`✅ ${channelId} connected successfully`);
      await this.updateChannelStatus(channelId, 'active');
      this.connectionStatus.set(channelId, 'active');
    }

    // Emit connection update event
    this.emit(
      'connection-update',
      channelId,
      connection || 'unknown',
      lastDisconnect,
    );
  }

  /**
   * Handles incoming messages
   */
  private async handleIncomingMessages(channelId: string, messageUpdate: any) {
    // Check if channel still exists before processing events
    if (!this.connections.has(channelId)) {
      console.log(
        `⚠️ Ignoring incoming message for deleted channel: ${channelId}`,
      );
      return;
    }

    const { messages, type } = messageUpdate;

    if (type !== 'notify') return;

    for (const message of messages) {
      // Skip if message is from us
      if (message.key.fromMe) continue;

      console.log(`📨 Incoming message for ${channelId}:`, message);

      // Emit message event
      this.emit('message', channelId, message);

      // TODO: Save to NotificationLogs collection
      // await this.saveIncomingMessage(channelId, message);
    }
  }

  /**
   * Handles message status updates (sent, delivered, read)
   */
  private async handleMessageStatusUpdates(channelId: string, updates: any[]) {
    // Check if channel still exists before processing events
    if (!this.connections.has(channelId)) {
      console.log(
        `⚠️ Ignoring message status update for deleted channel: ${channelId}`,
      );
      return;
    }

    for (const update of updates) {
      console.log(`📊 Message status update for ${channelId}:`, update);

      // Emit status update event
      this.emit('message-status', channelId, update);

      // TODO: Update NotificationLogs collection
      // await this.updateMessageStatus(channelId, update);
    }
  }

  /**
   * Sends a text message
   */
  async sendTextMessage(
    channelId: string,
    to: string,
    text: string,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      const message = await sock.sendMessage(to, { text });
      console.log(`📤 Message sent from ${channelId} to ${to}`);
      return message;
    } catch (error) {
      console.error(`❌ Error sending message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Sends a media message
   */
  async sendMediaMessage(
    channelId: string,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    media: Buffer | string,
    caption?: string,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      const messageContent: any = {};
      messageContent[mediaType] = media;
      if (caption) messageContent.caption = caption;

      const message = await sock.sendMessage(to, messageContent);
      console.log(`📤 Media message sent from ${channelId} to ${to}`);
      return message;
    } catch (error) {
      console.error(`❌ Error sending media message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Disconnects a channel
   */
  async disconnectChannel(channelId: string): Promise<void> {
    const sock = this.connections.get(channelId);
    if (sock) {
      await sock.logout();
      this.connections.delete(channelId);
      await this.updateChannelStatus(channelId, 'inactive');
      console.log(`🚪 Channel ${channelId} disconnected`);
    }
  }

  /**
   * Gets connection status for a channel
   */
  getChannelStatus(channelId: string): string {
    // First check in-memory status
    const memoryStatus = this.connectionStatus.get(channelId);
    if (memoryStatus) {
      return memoryStatus;
    }

    // If not in memory, return 'inactive' (will be restored if it was actually active)
    return 'inactive';
  }

  /**
   * Gets connection status for a channel from database
   */
  async getChannelStatusFromDB(channelId: string): Promise<string> {
    try {
      const channel = await Channel.findOne({ channelId });
      return channel?.status || 'inactive';
    } catch (error) {
      console.error(
        `❌ Error getting channel status from DB for ${channelId}:`,
        error,
      );
      return 'inactive';
    }
  }

  /**
   * Syncs memory status with database status (useful after server restart)
   */
  async syncChannelStatus(channelId: string): Promise<string> {
    try {
      const dbStatus = await this.getChannelStatusFromDB(channelId);

      // If database shows active status but memory shows inactive, update memory
      if (
        dbStatus !== 'inactive' &&
        this.connectionStatus.get(channelId) === undefined
      ) {
        console.log(`🔄 Syncing status for channel ${channelId}: ${dbStatus}`);
        this.connectionStatus.set(channelId, dbStatus);
      }

      return dbStatus;
    } catch (error) {
      console.error(`❌ Error syncing channel status for ${channelId}:`, error);
      return 'inactive';
    }
  }

  /**
   * Completely removes a channel from memory and prevents future events
   */
  async removeChannel(channelId: string): Promise<void> {
    try {
      console.log(`🗑️ Removing channel ${channelId} from WhatsApp service...`);

      // Close and remove the socket connection if it exists
      const socket = this.connections.get(channelId);
      if (socket) {
        console.log(`🔌 Closing socket connection for channel ${channelId}`);
        try {
          // Gracefully close the Baileys connection
          await socket.logout();
        } catch (error) {
          console.warn(`⚠️ Error closing socket for ${channelId}:`, error);
        }
      }

      // Remove from all memory maps
      this.connections.delete(channelId);
      this.connectionStatus.delete(channelId);

      // Clear auth state if it exists
      await this.clearAuthState(channelId);

      console.log(
        `✅ Channel ${channelId} removed from WhatsApp service memory`,
      );
    } catch (error) {
      console.error(`❌ Error removing channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Gets all active connections
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Updates channel status in database
   */
  private async updateChannelStatus(
    channelId: string,
    status: string,
  ): Promise<void> {
    try {
      await Channel.findOneAndUpdate(
        { channelId },
        {
          status,
          lastStatusUpdate: new Date(),
        },
      );
    } catch (error) {
      console.error(
        `❌ Error updating channel status for ${channelId}:`,
        error,
      );
    }
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up WhatsApp connections...');
    const disconnectPromises = Array.from(this.connections.keys()).map(
      (channelId) => this.disconnectChannel(channelId),
    );
    await Promise.all(disconnectPromises);
  }

  /**
   * Clears auth state for a channel (useful for debugging)
   */
  async clearAuthState(channelId: string): Promise<void> {
    try {
      await WhatsAppAuthState.deleteMany({ channelId });
      await WhatsAppAuthKey.deleteMany({ channelId });
      console.log(`🧹 Cleared auth state for channel: ${channelId}`);
    } catch (error) {
      console.error(`❌ Error clearing auth state for ${channelId}:`, error);
    }
  }
}

// Singleton instance
export const whatsAppService = new WhatsAppService();
