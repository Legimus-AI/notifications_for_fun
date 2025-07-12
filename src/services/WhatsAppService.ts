import { makeWASocket, useMultiFileAuthState, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
const P = pino;
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import NodeCache from 'node-cache';
import {
  WhatsAppAuthState,
  WhatsAppAuthKey,
} from '../models/WhatsAppAuthState';
import Channel from '../models/Channels';
import WhatsAppEvents from '../models/WhatsAppEvents';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { removeSuffixFromJid } from '../helpers/utils';
import { WAMessage, GroupMetadata } from '@whiskeysockets/baileys';

export interface WhatsAppServiceEvents {
  qr: (channelId: string, qr: string) => void;
  'pairing-code': (channelId: string, code: string) => void;
  'connection-update': (
    channelId: string,
    status: string,
    lastDisconnect?: any,
  ) => void;
  message: (channelId: string, payload: any) => void;
  'message-status': (channelId: string, status: any) => void;
  call: (channelId: string, payload: any) => void;
}

export class WhatsAppService extends EventEmitter {
  private connections: Map<string, WASocket> = new Map();
  private connectionStatus: Map<string, string> = new Map();
  private groupCache: NodeCache;
  private phoneValidationCache: NodeCache;
  private preloadAttempts: Map<string, number> = new Map(); // Track preload attempts per channel
  private lastPreloadAttempt: Map<string, number> = new Map(); // Track last preload timestamp
  private contacts: Map<string, string[]> = new Map(); // Store contact JIDs per channel

  constructor() {
    super();

    // Initialize group metadata cache
    // Cache for 1 hour (3600 seconds) with automatic cleanup every 5 minutes
    this.groupCache = new NodeCache({
      stdTTL: 3600, // 1 hour
      checkperiod: 300, // Check for expired keys every 5 minutes
      useClones: false, // Don't clone objects for better performance
    });

    // Initialize phone number validation cache
    // Cache for 24 hours (86400 seconds) with automatic cleanup every 1 hour
    this.phoneValidationCache = new NodeCache({
      stdTTL: 86400, // 24 hours
      checkperiod: 3600, // Check for expired keys every 1 hour
      useClones: false, // Don't clone objects for better performance
    });
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
      // Check if connection already exists
      if (this.connections.has(channelId)) {
        console.log(`🔌 Channel ${channelId} already connected, skipping...`);
        return;
      }

      const { state, saveCreds } = await useMultiFileAuthState(channelId);

      const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'debug' }),
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true, // Enable full history sync to get all contacts
        browser: Browsers.macOS('Desktop'), // Emulate desktop for better history sync
        // Implement cached group metadata to prevent rate limits and bans
        cachedGroupMetadata: async (jid) => {
          const cached = this.groupCache.get(jid);
          if (cached) {
            console.log(`📋 Using cached group metadata for ${jid}`);
            return cached as GroupMetadata;
          }
          console.log(`🔍 No cached metadata found for group ${jid}`);
          return undefined;
        },
        // getMessage: async (key) => {
        //   // Implement message retrieval from your database
        //   return null;
        // },
      });

      // Listen for history set to capture contacts
      sock.ev.on('messaging-history.set', ({ contacts }) => {
        const contactJids = contacts.map(c => c.id);
        this.contacts.set(channelId, contactJids);
        console.log(`📇 Synced ${contactJids.length} contacts for channel ${channelId}`);
      });

      // Save credentials when updated
      sock.ev.on('creds.update', saveCreds);

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(channelId, update, phoneNumber);
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
        console.log(
          `🔄 Groups updated for channel ${channelId}:`,
          updates.length,
        );

        // Only cache metadata that we already have or that's provided in the update
        // Avoid fetching metadata to prevent rate limits as per Baileys documentation
        for (const update of updates) {
          try {
            if (update.id) {
              // Only cache if we have the actual metadata in the update
              // Don't fetch it to avoid rate limits
              if (update.participants || update.subject || update.desc) {
                console.log(
                  `📋 Caching updated metadata for group ${update.id} (from update event)`,
                );
                // Cache the partial update - Baileys will handle full metadata when needed
                const existingCache =
                  (this.groupCache.get(update.id) as any) || {};
                const updatedMetadata = { ...existingCache, ...update };
                this.groupCache.set(update.id, updatedMetadata);
              }
            }
          } catch (error) {
            console.error(
              `❌ Error caching group metadata update for ${update.id}:`,
              error,
            );
          }
        }
      });

      // Handle incoming calls
      sock.ev.on('call', async (callEvents) => {
        await this.handleIncomingCalls(channelId, callEvents);
      });

      // Store connection
      this.connections.set(channelId, sock);
      this.connectionStatus.set(channelId, 'connecting');

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

      // Store QR code in channel config
      await this.updateChannelConfig(channelId, { qrCode: qrDataURL });

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

      // Reset preload attempts on successful connection
      this.preloadAttempts.delete(channelId);
      this.lastPreloadAttempt.delete(channelId);

      // Update channel config with phoneNumber if provided
      if (phoneNumber) {
        await this.updateChannelConfig(channelId, { phoneNumber });
      }

      // Get the connected phone number from Baileys and update config
      const sock = this.connections.get(channelId);
      if (sock && sock.user?.id) {
        const connectedPhoneNumber = sock.user.id.split(':')[0];
        await this.updateChannelConfig(channelId, {
          phoneNumber: connectedPhoneNumber,
          connectedAt: new Date(),
        });
        console.log(
          `📱 Captured connected phone number for ${channelId}: ${connectedPhoneNumber}`,
        );
      }

      console.log(
        `📋 Group metadata caching enabled for ${channelId} - will cache on-demand to prevent rate limits (following Baileys best practices)`,
      );
      console.log(
        `ℹ️ Skipping aggressive group preloading to prevent rate-overlimit errors as recommended by Baileys documentation`,
      );
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
      await WhatsAppEvents.create({ channelId, payload: message });

      // Skip if message is from us
      if (message.key.fromMe) continue;

      console.log(
        `📨 Incoming message for ${channelId}:`,
        JSON.stringify(message, null, 2),
      );

      // Format message to webhook payload format
      const payload = await this.formatMessageToWebhookPayload(
        channelId,
        message,
      );
      console.log(JSON.stringify(payload, null, 2));


      // Emit message event with formatted payload
      this.emit('message', channelId, payload);

      // Send to webhooks
      if (payload) {
        this.sendToWebhooks(channelId, 'message.received', payload);
      }

      // TODO: Save to NotificationLogs collection
      // await this.saveIncomingMessage(channelId, message);
    }
  }

  /**
   * Sends payload to configured webhooks for a given event.
   */
  private async sendToWebhooks(channelId: string, event: string, payload: any) {
    try {
      const channel = await Channel.findOne({ channelId });
      if (!channel || !channel.webhooks || channel.webhooks.length === 0) {
        return;
      }

      const webhooksToTrigger = channel.webhooks.filter(
        (webhook) => webhook.isActive && webhook.events.includes(event),
      );

      if (webhooksToTrigger.length === 0) {
        return;
      }

      console.log(
        `🚀 Triggering ${webhooksToTrigger.length} webhooks for event '${event}' on channel ${channelId}`,
      );

      const webhookPromises = webhooksToTrigger.map((webhook) => {
        console.log(`  -> Sending to ${webhook.url}`);
        return axios
          .post(webhook.url, payload, {
            headers: {
              'Content-Type': 'application/json',
              'X-Channel-Id': channelId,
              'X-Event': event,
            },
          })
          .catch((error) => {
            console.error(
              `❌ Error sending webhook to ${webhook.url}:`,
              error.message,
            );
            // We don't rethrow, just log the error to not stop other webhooks
          });
      });

      await Promise.all(webhookPromises);
    } catch (error) {
      console.error(
        `❌ Error processing webhooks for channel ${channelId}:`,
        error,
      );
    }
  }

  /**
   * Formats a Baileys message into a WhatsApp Cloud API-like webhook payload.
   */
  private async formatMessageToWebhookPayload(
    channelId: string,
    message: WAMessage,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      return null;
    }

    const from = message.key.remoteJid;
    const messageId = message.key.id;
    const timestamp = message.messageTimestamp;
    const contactName = message.pushName || from;

    const payload: any = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: channelId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: sock.user?.id.split(':')[0],
                  phone_number_id: sock.user?.id,
                },
                contacts: [
                  {
                    profile: {
                      name: contactName,
                    },
                    wa_id: removeSuffixFromJid(from),
                  },
                ],
                messages: [
                  {
                    from: removeSuffixFromJid(from),
                    id: messageId,
                    timestamp,
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const messageContent = message.message;
    const messageContainer = payload.entry[0].changes[0].value.messages[0];
    let contextInfo: proto.IContextInfo | null | undefined;

    if (messageContent?.conversation) {
      messageContainer.type = 'text';
      messageContainer.text = { body: messageContent.conversation };
    } else if (messageContent?.extendedTextMessage) {
      messageContainer.type = 'text';
      messageContainer.text = { body: messageContent.extendedTextMessage.text };
      contextInfo = messageContent.extendedTextMessage.contextInfo;
    } else if (messageContent?.imageMessage) {
      messageContainer.type = 'image';
      messageContainer.image = await this.extractMediaPayload(
        channelId,
        message,
        'image',
        messageContent.imageMessage,
      );
      contextInfo = messageContent.imageMessage.contextInfo;
    } else if (messageContent?.videoMessage) {
      messageContainer.type = 'video';
      messageContainer.video = await this.extractMediaPayload(
        channelId,
        message,
        'video',
        messageContent.videoMessage,
      );
      contextInfo = messageContent.videoMessage.contextInfo;
    } else if (messageContent?.audioMessage) {
      messageContainer.type = 'audio';
      messageContainer.audio = await this.extractMediaPayload(
        channelId,
        message,
        'audio',
        messageContent.audioMessage,
      );
      contextInfo = messageContent.audioMessage.contextInfo;
    } else if (messageContent?.documentMessage) {
      messageContainer.type = 'document';
      messageContainer.document = await this.extractMediaPayload(
        channelId,
        message,
        'document',
        messageContent.documentMessage,
      );
      contextInfo = messageContent.documentMessage.contextInfo;
    } else if (messageContent?.stickerMessage) {
      messageContainer.type = 'sticker';
      messageContainer.sticker = await this.extractMediaPayload(
        channelId,
        message,
        'sticker',
        messageContent.stickerMessage,
      );
      contextInfo = messageContent.stickerMessage.contextInfo;
    } else if (messageContent?.reactionMessage) {
      messageContainer.type = 'reaction';
      messageContainer.reaction = {
        message_id: messageContent.reactionMessage.key.id,
        emoji: messageContent.reactionMessage.text,
      };
      console.log(`👍 Reaction message detected: ${messageContent.reactionMessage.text} on message ${messageContent.reactionMessage.key.id}`);
    } else {
      messageContainer.type = 'unsupported';
      messageContainer.errors = [
        {
          code: 501,
          title: 'Unsupported message type',
        },
      ];
    }

    // Handle context for replies
    if (contextInfo && contextInfo.stanzaId) {
      messageContainer.context = {
        from: removeSuffixFromJid(contextInfo.participant),
        id: contextInfo.stanzaId,
        quotedMessage: contextInfo.quotedMessage,
      };
    }

    return payload;
  }

  /**
   * Extracts media from a message, saves it, and returns the media payload.
   */
  private async extractMediaPayload(
    channelId: string,
    message: WAMessage,
    type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
    mediaMessage: any,
  ): Promise<any> {
    try {
      const buffer = await downloadMediaMessage(message, 'buffer', {});
      const fileExtension = mediaMessage.mimetype.split('/')[1].split(';')[0];
      const fileName = `${uuidv4()}.${fileExtension}`;

      const storagePath = path.join(__dirname, `../../storage/${channelId}`);
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      const filePath = path.join(storagePath, fileName);
      await fs.promises.writeFile(filePath, buffer);

      const url = `${process.env.BACKEND_DOMAIN}/storage/${channelId}/${fileName}`;

      const payload: any = {
        mime_type: mediaMessage.mimetype,
        url: url,
        // sha256: mediaMessage.fileSha256.toString('base64'),
        // file_length: mediaMessage.fileLength,
      };

      if ('caption' in mediaMessage) {
        payload.caption = mediaMessage.caption;
      }

      if ('fileName' in mediaMessage) {
        payload.filename = mediaMessage.fileName;
      }

      return payload;
    } catch (error) {
      console.error(
        `❌ Error downloading media for message ${message.key.id}:`,
        error,
      );
      return {
        error: 'Failed to download media',
      };
    }
  }

  /**
   * Formats a Baileys call event into a WhatsApp Cloud API-like webhook payload.
   */
  private async formatCallToWebhookPayload(
    channelId: string,
    callEvent: any,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      return null;
    }

    const from = callEvent.from;
    const callId = callEvent.id;
    const timestamp = callEvent.date || Math.floor(Date.now() / 1000);
    const status = callEvent.status; // 'offer', 'accept', 'reject', 'timeout'
    const isVideo = callEvent.isVideo || false;
    const isGroup = callEvent.isGroup || false;

    const payload: any = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: channelId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: sock.user?.id.split(':')[0],
                  phone_number_id: sock.user?.id,
                },
                statuses: [
                  {
                    id: callId,
                    status: 'call_received',
                    timestamp: timestamp,
                    recipient_id: sock.user?.id.split(':')[0],
                    call: {
                      from: removeSuffixFromJid(from),
                      status: status,
                      type: isVideo ? 'video' : 'voice',
                      is_group: isGroup,
                      call_id: callId,
                    },
                  },
                ],
              },
              field: 'call_status',
            },
          ],
        },
      ],
    };

    console.log(`📞 Formatted call event for ${channelId}: ${status} ${isVideo ? 'video' : 'voice'} call from ${from}`);

    return payload;
  }

  /**
   * Formats a Baileys message status update into a WhatsApp Cloud API-like webhook payload.
   */
  private async formatStatusToWebhookPayload(
    channelId: string,
    statusUpdate: any,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      return null;
    }

    const messageId = statusUpdate.key.id;
    const to = statusUpdate.key.remoteJid;
    const numericStatus = statusUpdate.update?.status; // Baileys sends numeric status codes
    const timestamp = statusUpdate.timestamp || Math.floor(Date.now() / 1000);

    // Map Baileys numeric status codes to WhatsApp Cloud API status strings
    // Based on actual behavior observed in logs:
    // 0: pending/sent, 1: sent (server received), 2: sent, 3: delivered, 4: read
    let webhookStatus: string;
    switch (numericStatus) {
      case 0:
        webhookStatus = 'sent';
        break;
      case 1:
        webhookStatus = 'sent'; // Server received, treat as sent
        break;
      case 2:
        webhookStatus = 'sent'; // Message sent
        break;
      case 3:
        webhookStatus = 'delivered'; // Message delivered to recipient
        break;
      case 4:
        webhookStatus = 'read'; // Message read by recipient
        break;
      default:
        console.warn(`⚠️ Unknown status code ${numericStatus} for message ${messageId}`);
        webhookStatus = 'unknown';
        break;
    }

    const payload: any = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: channelId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: sock.user?.id.split(':')[0],
                  phone_number_id: sock.user?.id,
                },
                statuses: [
                  {
                    id: messageId,
                    status: webhookStatus,
                    timestamp: timestamp,
                    recipient_id: removeSuffixFromJid(to),
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    // Add additional fields for read status
    if (webhookStatus === 'read') {
      payload.entry[0].changes[0].value.statuses[0].conversation = {
        id: removeSuffixFromJid(to),
        origin: {
          type: 'user_initiated',
        },
      };
    }

    console.log(`📊 Formatted status update for ${channelId}: ${webhookStatus} (code: ${numericStatus}) for message ${messageId}`);

    return payload;
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
      console.log(`📊 Message status update for ${channelId}:`, JSON.stringify(update, null, 2));

      // Format status update to webhook payload format
      const payload = await this.formatStatusToWebhookPayload(channelId, update);
      console.log("Status payload formatted:", JSON.stringify(payload, null, 2));

      if (payload) {
        // Emit status update event
        this.emit('message-status', channelId, payload);

        // Determine webhook event type based on status from the formatted payload
        const webhookStatus = payload.entry[0]?.changes[0]?.value?.statuses[0]?.status;
        let webhookEventType = 'message.status';

        if (webhookStatus === 'sent') {
          webhookEventType = 'message.sent';
        } else if (webhookStatus === 'delivered') {
          webhookEventType = 'message.delivered';
        } else if (webhookStatus === 'read') {
          webhookEventType = 'message.read';
        }

        // Send to webhooks
        this.sendToWebhooks(channelId, webhookEventType, payload);
      }

      // TODO: Update NotificationLogs collection
      // await this.updateMessageStatus(channelId, update);
    }
  }

  /**
   * Handles incoming calls
   */
  private async handleIncomingCalls(channelId: string, callEvents: any[]) {
    // Check if channel still exists before processing events
    if (!this.connections.has(channelId)) {
      console.log(
        `⚠️ Ignoring incoming call for deleted channel: ${channelId}`,
      );
      return;
    }

    for (const callEvent of callEvents) {
      console.log(`📞 Incoming call for ${channelId}:`, JSON.stringify(callEvent, null, 2));

      // Save call event to database
      await WhatsAppEvents.create({ channelId, payload: callEvent });

      // Format call event to webhook payload format
      const payload = await this.formatCallToWebhookPayload(channelId, callEvent);
      console.log("Call payload formatted:", JSON.stringify(payload, null, 2));
      if (payload) {
        // Emit call event
        this.emit('call', channelId, payload);

        // Send to webhooks
        this.sendToWebhooks(channelId, 'call.received', payload);
      }
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
   * Sends a WhatsApp story/status update (24 hours)
   */
  async sendStory(
    channelId: string,
    type: 'text' | 'image' | 'video',
    content: any,
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      let messageContent: any = {};
      const messageOptions: any = {
        broadcast: true // Enable broadcast mode for status updates
      };

      // If a specific list of contacts is provided, add it to the options.
      // Otherwise, use all synced contacts to send to everyone
      let statusJidList = content.statusJidList;
      if (
        !statusJidList ||
        !Array.isArray(statusJidList) ||
        statusJidList.length === 0
      ) {
        statusJidList = this.contacts.get(channelId) || [];
        if (statusJidList.length === 0) {
          console.warn(`⚠️ No contacts synced for channel ${channelId}. Story may not be visible.`);
        }
      }
      messageOptions.statusJidList = statusJidList;

      switch (type) {
        case 'text':
          if (typeof content === 'string') {
            messageContent = { text: content };
          } else if (content.text) {
            messageContent = { text: content.text };
            // Text-specific story options must be in the third parameter (options)
            if (content.font) messageOptions.font = content.font;
            if (content.backgroundColor)
              messageOptions.backgroundColor = content.backgroundColor;
          } else {
            throw new Error('Text content is required for text stories');
          }
          break;

        case 'image':
          if (content.url || content.buffer) {
            messageContent = {
              image: content.url ? { url: content.url } : content.buffer,
              caption: content.caption || '',
            };
            // For non-text stories, add optional background if provided
            if (content.backgroundColor) {
              messageOptions.backgroundColor = content.backgroundColor;
            }
          } else {
            throw new Error('Image URL or buffer is required for image stories');
          }
          break;

        case 'video':
          if (content.url || content.buffer) {
            messageContent = {
              video: content.url ? { url: content.url } : content.buffer,
              caption: content.caption || '',
            };
            // For non-text stories, add optional background if provided
            if (content.backgroundColor) {
              messageOptions.backgroundColor = content.backgroundColor;
            }
          } else {
            throw new Error('Video URL or buffer is required for video stories');
          }
          break;
      }

      console.log(`📖 Sending story from channel: ${channelId}`);
      console.log(`📖 Target JID: status@broadcast`);
      console.log(`📖 Message content:`, JSON.stringify(messageContent));
      console.log(`📖 Message options:`, JSON.stringify(messageOptions));

      // To send a story, the JID must be 'status@broadcast'
      const result = await sock.sendMessage(
        'status@broadcast',
        messageContent,
        messageOptions,
      );

      console.log(`✅ Story sent successfully from ${channelId}`);
      return result;
    } catch (error) {
      console.error(
        `❌ Error sending story from channel ${channelId}:`,
        error,
      );
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
      this.preloadAttempts.delete(channelId);
      this.lastPreloadAttempt.delete(channelId);

      // Clear auth state if it exists
      await this.clearAuthState(channelId);

      // Clear phone validation cache for this channel
      this.clearPhoneValidationCache(channelId);

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
   * Updates channel config with phoneNumber and other WhatsApp-specific data
   */
  private async updateChannelConfig(
    channelId: string,
    configUpdate: Partial<any>,
  ): Promise<void> {
    try {
      const channel = await Channel.findOne({ channelId });
      if (channel) {
        // Merge the new config with existing config
        const updatedConfig = { ...channel.config, ...configUpdate };

        await Channel.findOneAndUpdate(
          { channelId },
          {
            config: updatedConfig,
            lastStatusUpdate: new Date(),
          },
        );

        console.log(
          `📝 Updated config for channel ${channelId}:`,
          configUpdate,
        );
      }
    } catch (error) {
      console.error(
        `❌ Error updating channel config for ${channelId}:`,
        error,
      );
    }
  }

  /**
   * Refreshes QR code for an existing channel by clearing auth state and reconnecting
   */
  async refreshQRCode(channelId: string): Promise<void> {
    try {
      console.log(`🔄 Refreshing QR code for channel: ${channelId}`);

      // Step 1: Disconnect current connection if exists
      const currentConnection = this.connections.get(channelId);
      if (currentConnection) {
        console.log(`🔌 Disconnecting current connection for ${channelId}`);
        try {
          await currentConnection.logout();
        } catch (error) {
          console.warn(`⚠️ Error during logout for ${channelId}:`, error);
        }
        this.connections.delete(channelId);
      }

      // Step 2: Clear auth state to force fresh QR generation
      console.log(`🧹 Clearing auth state for ${channelId} to generate fresh QR`);
      await this.clearAuthState(channelId);

      // Step 3: Update channel status
      await this.updateChannelStatus(channelId, 'generating_qr');
      this.connectionStatus.set(channelId, 'generating_qr');

      // Step 4: Clear any cached config QR code
      await this.updateChannelConfig(channelId, { qrCode: null });

      // Step 5: Reconnect to generate new QR code
      console.log(`🔄 Starting fresh connection for ${channelId}`);
      await this.connectChannel(channelId);

      console.log(`✅ QR refresh initiated for channel: ${channelId}`);
    } catch (error) {
      console.error(`❌ Error refreshing QR code for ${channelId}:`, error);
      await this.updateChannelStatus(channelId, 'error');
      throw error;
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

    // Clear all cached group metadata
    this.clearGroupCache();

    // Clear phone validation cache
    this.clearPhoneValidationCache();

    // Clear all tracking maps
    this.preloadAttempts.clear();
    this.lastPreloadAttempt.clear();
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

  /**
   * DEPRECATED: Manual group metadata preloading is discouraged by Baileys documentation
   * as it causes rate-overlimit errors. The cachedGroupMetadata function handles this automatically.
   *
   * This method is kept for backward compatibility but should not be used.
   * See: https://baileys.wiki/docs/socket/configuration#cachedgroupmetadata
   */
  async preloadGroupMetadata(): Promise<void> {
    console.warn(
      `⚠️ preloadGroupMetadata is deprecated - Baileys handles group metadata caching automatically to prevent rate limits`,
    );
    console.warn(
      `ℹ️ See: https://baileys.wiki/docs/socket/configuration#cachedgroupmetadata`,
    );

    // Don't actually preload - let Baileys handle it on-demand
    return;
  }

  /**
   * Clears cached group metadata for a specific channel or all channels
   */
  clearGroupCache(channelId?: string): void {
    if (channelId) {
      // Clear cache entries for specific channel (if we had channel-specific keys)
      console.log(`🧹 Clearing group cache for channel: ${channelId}`);
      // Since we're using JID as keys, we can't easily filter by channel
      // This would require a more complex key structure if needed
    } else {
      // Clear all cached group metadata
      this.groupCache.flushAll();
      console.log('🧹 Cleared all cached group metadata');
    }
  }

  /**
   * Clears phone validation cache for a specific channel or all channels
   */
  clearPhoneValidationCache(channelId?: string): void {
    if (channelId) {
      // Clear cache entries for specific channel
      const keys = this.phoneValidationCache.keys();
      const channelKeys = keys.filter(key => key.startsWith(`${channelId}:`));
      this.phoneValidationCache.del(channelKeys);
      console.log(`🧹 Cleared phone validation cache for channel: ${channelId} (${channelKeys.length} entries)`);
    } else {
      // Clear all cached phone validations
      const totalKeys = this.phoneValidationCache.keys().length;
      this.phoneValidationCache.flushAll();
      console.log(`🧹 Cleared all phone validation cache (${totalKeys} entries)`);
    }
  }

  /**
   * Invalidates cache for a specific phone number
   */
  invalidatePhoneValidation(channelId: string, phoneNumber: string): void {
    const cacheKey = `${channelId}:${phoneNumber}`;
    const wasDeleted = this.phoneValidationCache.del(cacheKey);
    if (wasDeleted) {
      console.log(`🗑️ Invalidated phone validation cache for: ${phoneNumber}`);
    } else {
      console.log(`ℹ️ No cache entry found for phone number: ${phoneNumber}`);
    }
  }

  /**
   * Gets phone validation cache statistics
   */
  getPhoneValidationCacheStats(): { totalKeys: number; hits: number; misses: number; keys: string[] } {
    const stats = this.phoneValidationCache.getStats();
    return {
      totalKeys: this.phoneValidationCache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      keys: this.phoneValidationCache.keys(),
    };
  }

  /**
   * Validates a phone number with caching to prevent repeated validations
   */
  private async validatePhoneNumberWithCache(channelId: string, phoneNumber: string): Promise<void> {
    const cacheKey = `${channelId}:${phoneNumber}`;

    // Check if validation result is cached
    const cachedResult = this.phoneValidationCache.get<boolean>(cacheKey);

    if (cachedResult !== undefined) {
      console.log(`📋 Using cached validation for ${phoneNumber}: ${cachedResult ? 'valid' : 'invalid'}`);
      if (!cachedResult) {
        throw new Error(`Phone number ${phoneNumber} is not registered on WhatsApp`);
      }
      return;
    }

    // Perform validation if not cached
    console.log(`🔍 Validating phone number: ${phoneNumber} (not in cache)`);
    try {
      const validation = await this.checkIdExists(channelId, phoneNumber);

      // Cache the validation result
      this.phoneValidationCache.set(cacheKey, validation.exists);

      if (!validation.exists) {
        console.log(`❌ Phone number ${phoneNumber} is not registered on WhatsApp (cached for future use)`);
        throw new Error(`Phone number ${phoneNumber} is not registered on WhatsApp`);
      }

      console.log(`✅ Phone number ${phoneNumber} is valid on WhatsApp (cached for future use)`);
    } catch (error) {
      if (error.message.includes('not registered on WhatsApp')) {
        throw error; // Re-throw our custom error
      }
      console.error(`❌ Error validating phone number ${phoneNumber}:`, error);
      throw new Error(`Failed to validate phone number ${phoneNumber}. Please check the number format and try again.`);
    }
  }

  /**
   * Sends a message using a format similar to the WhatsApp Cloud API.
   * This handles both single and bulk messages, including replies with context.
   */
  async sendMessageFromApi(channelId: string, payload: any): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    let to = payload.to;
    const originalNumber = to; // Store original for validation

    // check if to has @s.whatsapp.net
    if (!to.includes('@s.whatsapp.net')) {
      to = to + '@s.whatsapp.net';
    }
    if (!to) {
      throw new Error('Recipient "to" is required');
    }

    // Validate phone number exists on WhatsApp (with caching)
    await this.validatePhoneNumberWithCache(channelId, originalNumber);

    let messageContent: any;

    // Handle context for replies
    let quotedMessage: any = null;
    if (payload.context && payload.context.message_id) {
      console.log(`🔄 Looking up original message for reply: ${payload.context.message_id}`);

      try {
        // Look up the original message from WhatsAppEvents collection
        const originalMessageDoc = await WhatsAppEvents.findOne({
          channelId,
          'payload.key.id': payload.context.message_id,
        }).sort({ createdAt: -1 }); // Get the most recent match

        if (originalMessageDoc && originalMessageDoc.payload) {
          quotedMessage = originalMessageDoc.payload;
          console.log(`✅ Found original message for reply: ${payload.context.message_id}`);
        } else {
          console.warn(`⚠️ Original message not found for reply: ${payload.context.message_id}`);
        }
      } catch (error) {
        console.error(`❌ Error looking up original message for reply:`, error);
        // Continue without quote if lookup fails
      }
    }

    switch (payload.type) {
      case 'text':
        messageContent = { text: payload.text.body };
        break;
      case 'image':
      case 'video':
      case 'audio':
      case 'document': {
        const mediaUrl = payload[payload.type].link;
        const caption = payload[payload.type].caption;
        if (!mediaUrl) {
          throw new Error(
            `"link" is required for media type "${payload.type}"`,
          );
        }
        messageContent = {
          [payload.type]: { url: mediaUrl },
          caption: caption,
        };
        break;
      }
      default:
        throw new Error(`Unsupported message type: "${payload.type}"`);
    }

    console.log("Quoted message:", quotedMessage);

    try {
      let message;

      // Send message with quoted reply if context is provided
      if (quotedMessage) {
        console.log(`📝 Sending reply to message: ${payload.context.message_id}`);
        message = await sock.sendMessage(to, messageContent, { quoted: quotedMessage });
      } else {
        message = await sock.sendMessage(to, messageContent);
      }

      console.log(`📤 Message sent from ${channelId} to ${to}${quotedMessage ? ' (reply)' : ''}`);
      return message;
    } catch (error) {
      console.error(`❌ Error sending message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if a given ID (JID) exists on WhatsApp.
   */
  async checkIdExists(
    channelId: string,
    jid: string,
  ): Promise<{ exists: boolean; jid: string }> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }
    const [result] = await sock.onWhatsApp(jid);
    if (result) {
      return { jid: result.jid, exists: !!result.exists };
    }
    return { exists: false, jid };
  }

  /**
   * Fetches the status of a contact.
   */
  async fetchContactStatus(
    channelId: string,
    jid: string,
  ): Promise<{ status: string; setAt: Date } | undefined> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }
    try {
      const status = await sock.fetchStatus(jid);
      return status as any;
    } catch (error) {
      console.error(`❌ Error fetching status for ${jid}:`, error);
      // It often fails if the user doesn't have a status or has privacy settings
      return undefined;
    }
  }

  /**
   * Fetches the profile picture URL of a contact or group.
   */
  async fetchProfilePictureUrl(
    channelId: string,
    jid: string,
    type: 'preview' | 'image' = 'preview',
  ): Promise<string | undefined> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }
    try {
      const url = await sock.profilePictureUrl(jid, type);
      return url;
    } catch (error) {
      console.error(`❌ Error fetching profile picture for ${jid}:`, error);
      // This can fail if the user has no profile picture or due to privacy settings
      return undefined;
    }
  }

  /**
   * Downloads and saves a profile picture locally, returning the local URL.
   */
  async downloadAndSaveProfilePicture(
    channelId: string,
    jid: string,
    type: 'preview' | 'image' = 'preview',
  ): Promise<string | undefined> {
    try {
      // First get the profile picture URL from WhatsApp
      const profilePictureUrl = await this.fetchProfilePictureUrl(
        channelId,
        jid,
        type,
      );

      if (!profilePictureUrl) {
        return undefined;
      }

      // Download the image
      const response = await axios.get(profilePictureUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });

      const buffer = Buffer.from(response.data);

      // Determine file extension from content type or default to jpg
      const contentType = response.headers['content-type'];
      let fileExtension = 'jpg';
      if (contentType) {
        if (contentType.includes('png')) fileExtension = 'png';
        else if (contentType.includes('gif')) fileExtension = 'gif';
        else if (contentType.includes('webp')) fileExtension = 'webp';
      }

      // Create filename with sanitized JID
      const sanitizedJid = jid.replace(/[@.]/g, '_');
      const fileName = `profile_${sanitizedJid}_${type}_${Date.now()}.${fileExtension}`;

      // Ensure storage directory exists
      const storagePath = path.join(__dirname, `../../storage/${channelId}`);
      if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
      }

      // Save the file
      const filePath = path.join(storagePath, fileName);
      await fs.promises.writeFile(filePath, buffer);

      // Return the public URL
      const publicUrl = `${process.env.BACKEND_DOMAIN}/storage/${channelId}/${fileName}`;

      console.log(`📸 Profile picture saved for ${jid}: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error(
        `❌ Error downloading and saving profile picture for ${jid}:`,
        error,
      );
      return undefined;
    }
  }
}

// Singleton instance
export const whatsAppService = new WhatsAppService();
