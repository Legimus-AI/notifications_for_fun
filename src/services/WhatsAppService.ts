import makeWASocket, {
  WASocket,
  ConnectionState,
  DisconnectReason,
  AuthenticationState,
  AuthenticationCreds,
  initAuthCreds,
  Browsers,
  downloadMediaMessage,
  proto,
  WAMessage,
  GroupMetadata,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
} from '@whiskeysockets/baileys';
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
import { removeSuffixFromJid, formatJid } from '../helpers/utils';

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
      // Exclude 'disconnected' channels to prevent restoration
      const activeChannels = await Channel.find({
        type: 'whatsapp_automated',
        status: {
          $in: ['active', 'connecting', 'qr_ready', 'pairing_code_ready'],
          $nin: ['disconnected'],
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
   * Creates MongoDB-based auth state for production use with LID support
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

    // Create base key store
    const baseKeyStore = {
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
    };

    // Wrap with cacheable signal key store for LID support (Baileys 7 requirement)
    // Create a simple logger that matches Baileys' ILogger interface
    const logger = {
      level: 'info' as const,
      child: () => logger,
      trace: (...args: any[]) => console.debug(...args),
      debug: (...args: any[]) => console.debug(...args),
      info: (...args: any[]) => console.info(...args),
      warn: (...args: any[]) => console.warn(...args),
      error: (...args: any[]) => console.error(...args),
      fatal: (...args: any[]) => console.error(...args),
    };
    const cachedKeyStore = makeCacheableSignalKeyStore(baseKeyStore, logger);

    return {
      creds,
      keys: cachedKeyStore,
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

      // Store phoneNumber in config if provided
      if (phoneNumber) {
        await this.updateChannelConfig(channelId, { phoneNumber });
        console.log(`📱 Stored phoneNumber for ${channelId}: ${phoneNumber}`);
      }

      // For new connections, clear existing auth state to avoid Binary conversion issues
      const existingAuth = await WhatsAppAuthState.findOne({ channelId });
      if (!existingAuth) {
        console.log(
          `🆕 Creating fresh auth state for new channel: ${channelId}`,
        );
      }

      // Create auth state
      const auth = await this.createMongoAuthState(channelId);

      // Fetch the latest WhatsApp Web version
      const { version, isLatest } = await fetchLatestWaWebVersion({});
      console.log(
        `📱 Using WhatsApp Web version: ${version.join(
          '.',
        )} (isLatest: ${isLatest})`,
      );

      // Create socket with Chrome Windows simulation for anti-ban
      // This simulates a real Chrome browser on Windows to reduce ban risk
      const sock = makeWASocket({
        version, // Use the fetched version
        auth,
        browser: Browsers.windows('WhatsApp Web'),
        printQRInTerminal: false,
        markOnlineOnConnect: false, // Critical: prevents auto online status
        syncFullHistory: false, // Reduces bandwidth and suspicion
        defaultQueryTimeoutMs: 60000,
        emitOwnEvents: false, // Don't emit events for own messages
        generateHighQualityLinkPreview: true, // Enable large thumbnail link previews
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

      // Handle LID mapping updates (Baileys 7 requirement)
      sock.ev.on('lid-mapping.update', async (mapping) => {
        console.log(
          `🔄 LID mapping update for channel ${channelId}:`,
          JSON.stringify(mapping, null, 2),
        );
        // LID mappings are automatically stored in sock.signalRepository.lidMapping
        // You can access them via:
        // - sock.signalRepository.lidMapping.getLIDForPN(pn)
        // - sock.signalRepository.lidMapping.getPNForLID(lid)
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
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (!this.connections.has(channelId) && currentStatus !== 'disconnecting') {
      console.log(
        `⚠️ Ignoring connection update for deleted channel: ${channelId}`,
      );
      return;
    }

    // Skip processing if channel is being disconnected or already disconnected
    if (currentStatus === 'disconnecting' || currentStatus === 'disconnected') {
      console.log(
        `⚠️ Ignoring connection update for ${currentStatus} channel: ${channelId}`,
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
   * Resolves LID to actual phone number JID using Baileys 7 LID mapping
   * Baileys 7 LID handling: messages can come from @lid addresses
   * Returns both the resolved JID and whether it was successfully mapped
   */
  private async resolveJidFromMessage(
    channelId: string,
    message: WAMessage,
  ): Promise<{ jid: string; isUnresolvedLid: boolean }> {
    let jid = message.key.remoteJid;
    const originalJid = jid;
    let isUnresolvedLid = false;

    // Check if remoteJid is a LID (@lid)
    if (jid && /@lid/.test(jid)) {
      console.log(`🔍 LID detected in remoteJid: ${jid}`);
      console.log(
        `📋 Message key details:`,
        JSON.stringify(
          {
            remoteJid: message.key.remoteJid,
            remoteJidAlt: message.key.remoteJidAlt,
            participant: message.key.participant,
            participantAlt: message.key.participantAlt,
            fromMe: message.key.fromMe,
            pushName: message.pushName,
          },
          null,
          2,
        ),
      );

      // For DMs: use senderPn (remoteJidAlt in message key)
      if (message.key.remoteJidAlt) {
        jid = message.key.remoteJidAlt;
        console.log(
          `✅ Resolved LID to actual number using remoteJidAlt: ${originalJid} → ${jid}`,
        );
        console.log(`   Resolution method: remoteJidAlt field`);
      }
      // For Groups: use participantAlt if available
      else if (message.key.participantAlt) {
        jid = message.key.participantAlt;
        console.log(
          `✅ Resolved LID to actual number using participantAlt: ${originalJid} → ${jid}`,
        );
        console.log(`   Resolution method: participantAlt field`);
      }
      // Fallback: check if participant has the actual number
      else if (
        message.key.participant &&
        !/@lid/.test(message.key.participant)
      ) {
        jid = message.key.participant;
        console.log(
          `✅ Using participant as actual number: ${originalJid} → ${jid}`,
        );
        console.log(`   Resolution method: participant field`);
      }
      // Last resort: use Baileys' LID mapping store
      else {
        const sock = this.connections.get(channelId);
        console.log(
          `🔧 Attempting LID mapping store resolution for: ${originalJid}`,
        );
        console.log(`   Socket available: ${!!sock}`);
        console.log(
          `   signalRepository available: ${!!sock?.signalRepository}`,
        );
        console.log(
          `   lidMapping available: ${!!sock?.signalRepository?.lidMapping}`,
        );

        if (sock && sock.signalRepository?.lidMapping) {
          try {
            console.log(
              `🔍 Calling lidMapping.getPNForLID('${originalJid}')...`,
            );
            const pn =
              await sock.signalRepository.lidMapping.getPNForLID(originalJid);
            console.log(
              `   lidMapping.getPNForLID result: ${pn ? pn : 'null'}`,
            );

            if (pn) {
              jid = pn;
              console.log(
                `✅ Resolved LID to PN using lidMapping.getPNForLID: ${originalJid} → ${jid}`,
              );
              console.log(`   Resolution method: Baileys LID mapping store`);
            } else {
              console.warn(`⚠️ LID mapping returned null for: ${originalJid}`);
              console.warn(`   Possible reasons:`);
              console.warn(
                `   - LID mapping not yet synced from WhatsApp server`,
              );
              console.warn(
                `   - User has privacy settings that prevent mapping`,
              );
              console.warn(
                `   - This is a new contact not in the mapping database`,
              );
              isUnresolvedLid = true;
            }
          } catch (error) {
            console.error(
              `❌ Error using lidMapping.getPNForLID for ${originalJid}:`,
            );
            console.error(`   Error details:`, error);
            console.warn(`   Falling back to extracting phone number from LID`);
            isUnresolvedLid = true;
          }
        } else {
          console.warn(
            `⚠️ signalRepository.lidMapping not available for channel ${channelId}`,
          );
          console.warn(
            `   Cannot use Baileys LID mapping - marking as unresolved`,
          );
          isUnresolvedLid = true;
        }
      }

      // Final check: if we still have a LID, mark as unresolved
      if (/@lid/.test(jid)) {
        console.warn(
          `⚠️ LID resolution failed. JID still contains @lid suffix: ${jid}`,
        );
        console.warn(
          `   Will extract phone number: ${jid.replace('@lid', '')}`,
        );
        console.warn(`   Webhook will be marked with isLid: true`);
        isUnresolvedLid = true;
      }
    }

    return { jid: jid || '', isUnresolvedLid };
  }

  /**
   * Handles incoming messages with LID support
   */
  private async handleIncomingMessages(channelId: string, messageUpdate: any) {
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (
      !this.connections.has(channelId) ||
      currentStatus === 'disconnecting' ||
      currentStatus === 'disconnected'
    ) {
      console.log(
        `⚠️ Ignoring incoming message for ${
          currentStatus === 'disconnecting'
            ? 'disconnecting'
            : currentStatus === 'disconnected'
            ? 'disconnected'
            : 'deleted'
        } channel: ${channelId}`,
      );
      return;
    }

    const { messages, type } = messageUpdate;

    if (type !== 'notify') return;

    for (const message of messages) {
      // Resolve LID to actual phone number before processing (Baileys 7 requirement)
      const originalRemoteJid = message.key.remoteJid;
      const resolutionResult = await this.resolveJidFromMessage(
        channelId,
        message,
      );
      const { jid: resolvedJid, isUnresolvedLid } = resolutionResult;

      // Update the remoteJid with the resolved actual phone number
      if (resolvedJid !== originalRemoteJid) {
        console.log(
          `🔄 Replacing LID ${originalRemoteJid} with actual number ${resolvedJid}`,
        );
        message.key.remoteJid = resolvedJid;
      }

      // Store unresolved LID flag in message metadata for webhook formatting
      (message as any)._isUnresolvedLid = isUnresolvedLid;

      // Determine if original message had LID
      const wasLid = /@lid/.test(originalRemoteJid);

      await WhatsAppEvents.create({
        channelId,
        payload: message,
        isLid: wasLid,
        isUnresolvedLid: isUnresolvedLid,
      });

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
   * Helper function to send webhook with retry logic
   */
  private async sendWebhookWithRetry(
    webhook: any,
    payload: any,
    channelId: string,
    event: string,
  ): Promise<void> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await axios.post(webhook.url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Channel-Id': channelId,
            'X-Event': event,
          },
          timeout: 30000, // 30 second timeout
        });

        if (attempt > 0) {
          console.log(`  ✅ Successfully sent to ${webhook.url} on attempt ${attempt + 1}`);
        }
        return; // Success, exit retry loop

      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          console.error(
            `❌ Final attempt failed for webhook ${webhook.url} after ${maxRetries + 1} attempts:`,
            error.message,
          );
          return; // Don't rethrow, just log the final failure
        }

        // Calculate exponential backoff delay: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(
          `  ⚠️  Attempt ${attempt + 1} failed for ${webhook.url}, retrying in ${delay / 1000}s...`,
          error.message
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
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
        return this.sendWebhookWithRetry(webhook, payload, channelId, event);
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
    const isUnresolvedLid = (message as any)._isUnresolvedLid;

    // If it's an unresolved LID, keep the @lid suffix, otherwise remove all suffixes
    const formattedFrom = isUnresolvedLid ? from : removeSuffixFromJid(from);

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
                    wa_id: formattedFrom,
                  },
                ],
                messages: [
                  {
                    from: formattedFrom,
                    id: messageId,
                    timestamp,
                    ...(isUnresolvedLid ? { isLid: true } : {}),
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
      console.log(
        `👍 Reaction message detected: ${messageContent.reactionMessage.text} on message ${messageContent.reactionMessage.key.id}`,
      );
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

    console.log(
      `📞 Formatted call event for ${channelId}: ${status} ${
        isVideo ? 'video' : 'voice'
      } call from ${from}`,
    );

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
        console.warn(
          `⚠️ Unknown status code ${numericStatus} for message ${messageId}`,
        );
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

    console.log(
      `📊 Formatted status update for ${channelId}: ${webhookStatus} (code: ${numericStatus}) for message ${messageId}`,
    );

    return payload;
  }

  /**
   * Resolves a JID (can be LID or PN) to a phone number JID
   */
  private async resolveJid(channelId: string, jid: string): Promise<string> {
    if (!jid) return jid;

    // Check if JID is a LID (@lid)
    if (/@lid/.test(jid)) {
      console.log(`🔍 LID detected in JID: ${jid}`);

      const sock = this.connections.get(channelId);
      if (sock && sock.signalRepository?.lidMapping) {
        try {
          const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
          if (pn) {
            console.log(
              `✅ Resolved LID to PN using lidMapping: ${jid} → ${pn}`,
            );
            return pn;
          } else {
            console.warn(`⚠️ Could not resolve LID using lidMapping: ${jid}`);
          }
        } catch (error) {
          console.error(
            `❌ Error using lidMapping.getPNForLID for ${jid}:`,
            error,
          );
        }
      }
    }

    return jid;
  }

  /**
   * Handles message status updates (sent, delivered, read) with LID resolution
   */
  private async handleMessageStatusUpdates(channelId: string, updates: any[]) {
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (
      !this.connections.has(channelId) ||
      currentStatus === 'disconnecting' ||
      currentStatus === 'disconnected'
    ) {
      console.log(
        `⚠️ Ignoring message status update for ${
          currentStatus === 'disconnecting'
            ? 'disconnecting'
            : currentStatus === 'disconnected'
            ? 'disconnected'
            : 'deleted'
        } channel: ${channelId}`,
      );
      return;
    }

    for (const update of updates) {
      console.log(
        `📊 Message status update for ${channelId}:`,
        JSON.stringify(update, null, 2),
      );

      // Resolve LID to PN if present in remoteJid
      if (update.key?.remoteJid) {
        const originalJid = update.key.remoteJid;
        const resolvedJid = await this.resolveJid(channelId, originalJid);
        if (resolvedJid !== originalJid) {
          console.log(
            `🔄 Status update - Resolved JID: ${originalJid} → ${resolvedJid}`,
          );
          update.key.remoteJid = resolvedJid;
        }
      }

      // Format status update to webhook payload format
      const payload = await this.formatStatusToWebhookPayload(
        channelId,
        update,
      );
      console.log('📊 Formatted status', JSON.stringify(payload, null, 2));

      if (payload) {
        // Emit status update event
        this.emit('message-status', channelId, payload);

        // Determine webhook event type based on status from the formatted payload
        const webhookStatus =
          payload.entry[0]?.changes[0]?.value?.statuses[0]?.status;
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
    // Check if channel still exists or is being disconnected before processing events
    const currentStatus = this.connectionStatus.get(channelId);
    if (
      !this.connections.has(channelId) ||
      currentStatus === 'disconnecting' ||
      currentStatus === 'disconnected'
    ) {
      console.log(
        `⚠️ Ignoring incoming call for ${
          currentStatus === 'disconnecting'
            ? 'disconnecting'
            : currentStatus === 'disconnected'
            ? 'disconnected'
            : 'deleted'
        } channel: ${channelId}`,
      );
      return;
    }

    for (const callEvent of callEvents) {
      console.log(
        `📞 Incoming call for ${channelId}:`,
        JSON.stringify(callEvent, null, 2),
      );

      // Save call event to database
      await WhatsAppEvents.create({ channelId, payload: callEvent });

      // Format call event to webhook payload format
      const payload = await this.formatCallToWebhookPayload(
        channelId,
        callEvent,
      );
      console.log('Call payload formatted:', JSON.stringify(payload, null, 2));
      if (payload) {
        // Emit call event
        this.emit('call', channelId, payload);

        // Send to webhooks
        this.sendToWebhooks(channelId, 'call.received', payload);
      }
    }
  }

  /**
   * Extracts URL from text message
   */
  private extractUrlFromText(text: string): string | null {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  }

  /**
   * Checks if URL is from Instagram
   */
  private isInstagramUrl(url: string): boolean {
    return url.includes('instagram.com') || url.includes('instagr.am');
  }

  /**
   * Fetches Instagram link preview using oEmbed API
   */
  private async getInstagramLinkPreview(
    url: string,
  ): Promise<any | null> {
    try {
      console.log(`📸 Fetching Instagram link preview for: ${url}`);

      // Use Instagram's oEmbed API
      const oEmbedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`;
      const response = await axios.get(oEmbedUrl, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const data = response.data;
      console.log(`✅ Instagram oEmbed response:`, JSON.stringify(data, null, 2));

      if (!data.title && !data.author_name) {
        console.log('⚠️ Instagram oEmbed returned no useful data');
        return null;
      }

      // Build link preview object for Baileys
      const linkPreview: any = {
        'canonical-url': url,
        'matched-text': url,
        title: data.title || `${data.author_name} on Instagram`,
        description:
          data.title ||
          `Post by ${data.author_name}` ||
          'Instagram post',
      };

      // Try to get thumbnail from oEmbed
      if (data.thumbnail_url) {
        try {
          console.log(`🖼️ Fetching Instagram thumbnail: ${data.thumbnail_url}`);

          // Download and upload the thumbnail for high quality preview
          const imageResponse = await axios.get(data.thumbnail_url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });

          const imageBuffer = Buffer.from(imageResponse.data);
          linkPreview.jpegThumbnail = imageBuffer;
          linkPreview.originalThumbnailUrl = data.thumbnail_url;

          console.log(
            `✅ Instagram thumbnail fetched: ${imageBuffer.length} bytes`,
          );
        } catch (thumbError) {
          console.error(
            `⚠️ Failed to fetch Instagram thumbnail:`,
            thumbError.message,
          );
        }
      }

      return linkPreview;
    } catch (error) {
      console.error(`❌ Error fetching Instagram link preview:`, error.message);
      return null;
    }
  }

  /**
   * Marks messages as read (sends "seen" status)
   * Call this before responding to simulate human-like behavior
   */
  async markAsRead(
    channelId: string,
    messageKeys: { remoteJid: string; id: string; fromMe?: boolean; participant?: string }[],
  ): Promise<void> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      console.warn(`⚠️ Cannot mark as read: Channel ${channelId} not connected`);
      return;
    }

    try {
      await sock.readMessages(messageKeys);
      console.log(`👁️ Marked ${messageKeys.length} message(s) as read`);
    } catch (error) {
      console.error(`❌ Error marking messages as read:`, error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Sends "composing" presence to show typing indicator
   * Call this when agent starts processing a response
   */
  async startTyping(channelId: string, jid: string): Promise<void> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      console.warn(`⚠️ Cannot start typing: Channel ${channelId} not connected`);
      return;
    }

    try {
      await sock.sendPresenceUpdate('composing', jid);
      console.log(`⌨️ Started typing indicator for ${jid}`);
    } catch (error) {
      console.error(`❌ Error starting typing indicator:`, error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Sends "paused" presence to hide typing indicator
   * Call this right before sending the message
   */
  async stopTyping(channelId: string, jid: string): Promise<void> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      console.warn(`⚠️ Cannot stop typing: Channel ${channelId} not connected`);
      return;
    }

    try {
      await sock.sendPresenceUpdate('paused', jid);
      console.log(`⏸️ Stopped typing indicator for ${jid}`);
    } catch (error) {
      console.error(`❌ Error stopping typing indicator:`, error);
      // Don't throw - this is a non-critical operation
    }
  }
  /**
   * Calculates typing delay based on text length to simulate human typing
   * Minimum 200ms, scales with text length, max 800ms
   */
  private calculateTypingDelay(text: string): number {
    const minDelay = 200;
    const maxDelay = 800;
    // Roughly 25ms per character, simulating ~40 chars/second typing speed
    const calculatedDelay = Math.min(text.length * 25, maxDelay);
    return Math.max(calculatedDelay, minDelay);
  }

  /**
   * Sends a text message with automatic anti-ban measures
   * Flow: markAsRead → startTyping → delay based on text length → stopTyping → send
   */
  async sendTextMessage(
    channelId: string,
    to: string,
    text: string,
    replyToMessage?: { remoteJid: string; id: string; fromMe?: boolean; participant?: string },
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      // Anti-ban: Mark the original message as read first (send "seen")
      if (replyToMessage) {
        await this.markAsRead(channelId, [replyToMessage]);
      }

      // Anti-ban: Start typing indicator
      await this.startTyping(channelId, to);

      // Anti-ban: Simulate typing delay based on text length
      const typingDelay = this.calculateTypingDelay(text);
      console.log(`⏱️ Simulating typing for ${typingDelay}ms (text length: ${text.length})`);
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      // Anti-ban: Stop typing indicator before sending
      await this.stopTyping(channelId, to);

      // Check if message contains an Instagram URL
      const url = this.extractUrlFromText(text);
      const messageContent: any = { text };

      if (url && this.isInstagramUrl(url)) {
        const linkPreview = await this.getInstagramLinkPreview(url);
        if (linkPreview) {
          messageContent.linkPreview = linkPreview;
          console.log(`📎 Using custom Instagram link preview`);
        }
      }

      const message = await sock.sendMessage(to, messageContent);
      console.log(`📤 Message sent from ${channelId} to ${to}`);
      return message;
    } catch (error) {
      console.error(`❌ Error sending message from ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Sends a media message with automatic anti-ban measures
   * Flow for media with caption: markAsRead → startTyping → delay based on caption length → stopTyping → send
   * Flow for media without caption: markAsRead → send
   */
  async sendMediaMessage(
    channelId: string,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    media: Buffer | string,
    caption?: string,
    replyToMessage?: { remoteJid: string; id: string; fromMe?: boolean; participant?: string },
  ): Promise<any> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    try {
      // Anti-ban: Mark the original message as read first (send "seen")
      if (replyToMessage) {
        await this.markAsRead(channelId, [replyToMessage]);
      }

      // Anti-ban: Only show typing if there's a caption
      if (caption) {
        await this.startTyping(channelId, to);

        // Simulate typing delay based on caption length
        const typingDelay = this.calculateTypingDelay(caption);
        console.log(`⏱️ Simulating typing for ${typingDelay}ms (caption length: ${caption.length})`);
        await new Promise(resolve => setTimeout(resolve, typingDelay));

        await this.stopTyping(channelId, to);
      }

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
   * Resets socket connection without clearing auth state (no QR needed on reconnect)
   */
  async resetSocketConnection(channelId: string): Promise<void> {
    try {
      console.log(
        `🔄 Resetting socket connection for channel: ${channelId} (preserving auth state)`,
      );

      const sock = this.connections.get(channelId);
      if (sock) {
        // Remove from connections map to prevent new events from being processed
        this.connections.delete(channelId);

        // Update memory status to indicate reset
        this.connectionStatus.set(channelId, 'resetting');

        try {
          // Just end the socket connection without logout (preserves auth state)
          sock.end(undefined);
          console.log(`🔌 Socket connection ended for channel: ${channelId}`);
        } catch (endError) {
          console.warn(
            `⚠️ Error ending socket for channel ${channelId}:`,
            endError,
          );
          // Continue with cleanup even if end fails
        }

        // Update database status
        await this.updateChannelStatus(channelId, 'reset');

        console.log(
          `✅ Channel ${channelId} socket reset successfully (auth state preserved)`,
        );
      } else {
        console.log(`⚠️ No active socket found for channel ${channelId}`);
      }
    } catch (error) {
      console.error(
        `❌ Error resetting socket for channel ${channelId}:`,
        error,
      );
      // Ensure cleanup even on error
      this.connections.delete(channelId);
      this.connectionStatus.set(channelId, 'error');
      throw error;
    }
  }

  /**
   * Disconnects a channel
   */
  async disconnectChannel(channelId: string): Promise<void> {
    try {
      console.log(`🔌 Disconnecting WhatsApp channel: ${channelId}`);

      const sock = this.connections.get(channelId);
      if (sock) {
        // First remove from connections map to prevent new events from being processed
        this.connections.delete(channelId);

        // Update memory status to prevent event processing
        this.connectionStatus.set(channelId, 'disconnecting');

        try {
          // Gracefully logout from WhatsApp
          await sock.logout();
          console.log(
            `📱 Successfully logged out from WhatsApp for channel: ${channelId}`,
          );
        } catch (logoutError) {
          console.warn(
            `⚠️ Error during logout for channel ${channelId}:`,
            logoutError,
          );
          // Continue with cleanup even if logout fails
        }

        // Clean up memory status
        this.connectionStatus.delete(channelId);

        // Update database status
        await this.updateChannelStatus(channelId, 'disconnected');

        console.log(`✅ Channel ${channelId} disconnected successfully`);
      } else {
        console.log(`⚠️ Channel ${channelId} was not connected`);
        // Still update status in case it was marked as active in DB
        await this.updateChannelStatus(channelId, 'disconnected');
      }
    } catch (error) {
      console.error(`❌ Error disconnecting channel ${channelId}:`, error);
      // Ensure cleanup even on error
      this.connections.delete(channelId);
      this.connectionStatus.delete(channelId);
      await this.updateChannelStatus(channelId, 'error');
      throw error;
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
      console.log(
        `🧹 Clearing auth state for ${channelId} to generate fresh QR`,
      );
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
      const channelKeys = keys.filter((key) => key.startsWith(`${channelId}:`));
      this.phoneValidationCache.del(channelKeys);
      console.log(
        `🧹 Cleared phone validation cache for channel: ${channelId} (${channelKeys.length} entries)`,
      );
    } else {
      // Clear all cached phone validations
      const totalKeys = this.phoneValidationCache.keys().length;
      this.phoneValidationCache.flushAll();
      console.log(
        `🧹 Cleared all phone validation cache (${totalKeys} entries)`,
      );
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
  getPhoneValidationCacheStats(): {
    totalKeys: number;
    hits: number;
    misses: number;
    keys: string[];
  } {
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
  private async validatePhoneNumberWithCache(
    channelId: string,
    phoneNumber: string,
  ): Promise<void> {
    const cacheKey = `${channelId}:${phoneNumber}`;

    // Check if validation result is cached
    const cachedResult = this.phoneValidationCache.get<boolean>(cacheKey);

    if (cachedResult !== undefined) {
      console.log(
        `📋 Using cached validation for ${phoneNumber}: ${
          cachedResult ? 'valid' : 'invalid'
        }`,
      );
      if (!cachedResult) {
        throw new Error(
          `Phone number ${phoneNumber} is not registered on WhatsApp`,
        );
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
        console.log(
          `❌ Phone number ${phoneNumber} is not registered on WhatsApp (cached for future use)`,
        );
        throw new Error(
          `Phone number ${phoneNumber} is not registered on WhatsApp`,
        );
      }

      console.log(
        `✅ Phone number ${phoneNumber} is valid on WhatsApp (cached for future use)`,
      );
    } catch (error) {
      if (error.message.includes('not registered on WhatsApp')) {
        throw error; // Re-throw our custom error
      }
      console.error(`❌ Error validating phone number ${phoneNumber}:`, error);
      throw new Error(
        `Failed to validate phone number ${phoneNumber}. Please check the number format and try again.`,
      );
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
    if (!to) {
      throw new Error('Recipient "to" is required');
    }

    const originalNumber = to; // Store original for validation

    // Format JID properly (handles @lid, @s.whatsapp.net, @g.us, etc.)
    to = formatJid(to);

    const isLid = to.includes('@lid');
    console.log(`📨 Sending message to: ${to}${isLid ? ' (LID)' : ''}`);

    // Validate phone number exists on WhatsApp (skip for LIDs)
    if (!isLid) {
      await this.validatePhoneNumberWithCache(channelId, originalNumber);
    } else {
      console.log(`⏭️ Skipping phone validation for LID: ${to}`);
    }

    let messageContent: any;

    // Handle context for replies
    let quotedMessage: any = null;
    if (payload.context && payload.context.message_id) {
      console.log(
        `🔄 Looking up original message for reply: ${payload.context.message_id}`,
      );

      try {
        // Look up the original message from WhatsAppEvents collection
        const originalMessageDoc = await WhatsAppEvents.findOne({
          channelId,
          'payload.key.id': payload.context.message_id,
        }).sort({ createdAt: -1 }); // Get the most recent match

        if (originalMessageDoc && originalMessageDoc.payload) {
          quotedMessage = originalMessageDoc.payload;
          console.log(
            `✅ Found original message for reply: ${payload.context.message_id}`,
          );
        } else {
          console.warn(
            `⚠️ Original message not found for reply: ${payload.context.message_id}`,
          );
        }
      } catch (error) {
        console.error(`❌ Error looking up original message for reply:`, error);
        // Continue without quote if lookup fails
      }
    }

    switch (payload.type) {
      case 'text': {
        const textBody = payload.text.body;
        messageContent = { text: textBody };

        // Check for Instagram URLs and add custom link preview
        const urlInText = this.extractUrlFromText(textBody);
        if (urlInText && this.isInstagramUrl(urlInText)) {
          const instagramPreview = await this.getInstagramLinkPreview(urlInText);
          if (instagramPreview) {
            messageContent.linkPreview = instagramPreview;
            console.log(`📎 Using custom Instagram link preview for API message`);
          }
        }
        break;
      }
      case 'image':
      case 'video':
      case 'audio': {
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
      case 'document': {
        const documentPayload = payload.document;
        if (!documentPayload || !documentPayload.link) {
          throw new Error(`"link" is required for document type`);
        }
        messageContent = {
          document: { url: documentPayload.link },
          caption: documentPayload.caption,
          fileName: documentPayload.filename,
        };
        break;
      }
      default:
        throw new Error(`Unsupported message type: "${payload.type}"`);
    }

    console.log('Quoted message:', quotedMessage);

    // Anti-ban: Mark the original message as read first (send "seen")
    if (quotedMessage) {
      await this.markAsRead(channelId, [
        {
          remoteJid: quotedMessage.key.remoteJid,
          id: quotedMessage.key.id,
          fromMe: quotedMessage.key.fromMe,
          participant: quotedMessage.key.participant,
        },
      ]);
    }

    // Anti-ban measures: typing indicator flow
    // For text: always show typing
    // For media: only show typing if there's a caption
    const textForTyping = payload.type === 'text'
      ? payload.text.body
      : payload[payload.type]?.caption;

    if (textForTyping) {
      // Start typing indicator
      await this.startTyping(channelId, to);

      // Simulate typing delay based on text length
      const typingDelay = this.calculateTypingDelay(textForTyping);
      console.log(`⏱️ Simulating typing for ${typingDelay}ms (text length: ${textForTyping.length})`);
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      // Stop typing before sending
      await this.stopTyping(channelId, to);
    }

    try {
      let message;

      // Send message with quoted reply if context is provided
      if (quotedMessage) {
        console.log(
          `📝 Sending reply to message: ${payload.context.message_id}`,
        );
        message = await sock.sendMessage(to, messageContent, {
          quoted: quotedMessage,
        });
      } else {
        message = await sock.sendMessage(to, messageContent);
      }

      console.log(
        `📤 Message sent from ${channelId} to ${to}${
          quotedMessage ? ' (reply)' : ''
        }`,
      );

      // Save the sent message to WhatsAppEvents for future reply reference
      try {
        const whatsAppEvent = new WhatsAppEvents({
          channelId: channelId,
          payload: message, // Save the full message object returned by Baileys
        });
        await whatsAppEvent.save();
        console.log(
          `💾 Sent message saved to WhatsAppEvents: ${message?.key?.id}`,
        );
      } catch (saveError) {
        console.error(
          `❌ Error saving sent message to WhatsAppEvents:`,
          saveError,
        );
        // Don't throw error here - message was sent successfully, saving is just for reference
      }

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

  /**
   * Get all known LID to phone number mappings for a channel
   */
  async getAllLids(
    channelId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Array<{ lid: string; pn: string }>> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      console.warn(`⚠️ LID mapping not available for channel ${channelId}`);
      return [];
    }

    try {
      // Access the internal store if available
      // Note: This is implementation-specific and may need adjustment based on Baileys version
      const store = sock.signalRepository.lidMapping as any;

      // Try to get all mappings if the store exposes them
      if (store.store && typeof store.store.toJSON === 'function') {
        const allMappings = store.store.toJSON();
        const mappings = Object.entries(allMappings).map(([lid, pn]) => ({
          lid,
          pn: pn as string,
        }));

        // Apply pagination
        return mappings.slice(offset, offset + limit);
      }

      console.warn(
        `⚠️ LID mapping store structure not accessible for channel ${channelId}`,
      );
      return [];
    } catch (error) {
      console.error(`❌ Error getting LID mappings for ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Get count of known LID mappings for a channel
   */
  async getLidsCount(channelId: string): Promise<number> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      return 0;
    }

    try {
      const store = sock.signalRepository.lidMapping as any;

      if (store.store && typeof store.store.toJSON === 'function') {
        const allMappings = store.store.toJSON();
        return Object.keys(allMappings).length;
      }

      return 0;
    } catch (error) {
      console.error(`❌ Error getting LID count for ${channelId}:`, error);
      return 0;
    }
  }

  /**
   * Get phone number for a specific LID
   */
  async getPhoneNumberByLid(
    channelId: string,
    lid: string,
  ): Promise<{ lid: string; pn: string } | null> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      throw new Error(`LID mapping not available for channel ${channelId}`);
    }

    // Ensure LID has proper suffix
    const formattedLid = lid.includes('@') ? lid : `${lid}@lid`;

    try {
      const pn =
        await sock.signalRepository.lidMapping.getPNForLID(formattedLid);

      if (pn) {
        return { lid: formattedLid, pn };
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Error getting phone number for LID ${formattedLid}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get LID for a specific phone number
   */
  async getLidByPhoneNumber(
    channelId: string,
    phoneNumber: string,
  ): Promise<{ lid: string; pn: string } | null> {
    const sock = this.connections.get(channelId);
    if (!sock) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    if (!sock.signalRepository?.lidMapping) {
      throw new Error(`LID mapping not available for channel ${channelId}`);
    }

    // Ensure phone number has proper suffix
    let formattedPn = phoneNumber;
    if (!phoneNumber.includes('@')) {
      formattedPn = `${phoneNumber}@s.whatsapp.net`;
    }

    try {
      const lid =
        await sock.signalRepository.lidMapping.getLIDForPN(formattedPn);

      if (lid) {
        return { lid, pn: formattedPn };
      }

      return null;
    } catch (error) {
      console.error(
        `❌ Error getting LID for phone number ${formattedPn}:`,
        error,
      );
      throw error;
    }
  }
}

// Singleton instance
export const whatsAppService = new WhatsAppService();
