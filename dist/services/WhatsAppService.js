"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsAppService = exports.WhatsAppService = void 0;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const qrcode_1 = __importDefault(require("qrcode"));
const node_cache_1 = __importDefault(require("node-cache"));
const WhatsAppAuthState_1 = require("../models/WhatsAppAuthState");
const Channels_1 = __importDefault(require("../models/Channels"));
const WhatsAppEvents_1 = __importDefault(require("../models/WhatsAppEvents"));
const events_1 = require("events");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("../helpers/utils");
class WhatsAppService extends events_1.EventEmitter {
    constructor() {
        super();
        this.connections = new Map();
        this.connectionStatus = new Map();
        this.preloadAttempts = new Map(); // Track preload attempts per channel
        this.lastPreloadAttempt = new Map(); // Track last preload timestamp
        // Initialize group metadata cache
        // Cache for 1 hour (3600 seconds) with automatic cleanup every 5 minutes
        this.groupCache = new node_cache_1.default({
            stdTTL: 3600,
            checkperiod: 300,
            useClones: false, // Don't clone objects for better performance
        });
        // Initialize phone number validation cache
        // Cache for 24 hours (86400 seconds) with automatic cleanup every 1 hour
        this.phoneValidationCache = new node_cache_1.default({
            stdTTL: 86400,
            checkperiod: 3600,
            useClones: false, // Don't clone objects for better performance
        });
    }
    /**
     * Restores all active channels on server restart
     */
    restoreActiveChannels() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('🔄 Restoring active WhatsApp channels...');
                // Find all channels that were active before server restart
                // Exclude 'disconnected' channels to prevent restoration
                const activeChannels = yield Channels_1.default.find({
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
                        console.log(`🔄 Restoring channel: ${channel.channelId} (${channel.name})`);
                        // Reset status to connecting for restoration
                        yield this.updateChannelStatus(channel.channelId, 'connecting');
                        // Set initial memory status
                        this.connectionStatus.set(channel.channelId, 'connecting');
                        // Attempt to reconnect
                        yield this.connectChannel(channel.channelId);
                        // Add delay between connections to avoid overwhelming
                        if (i < activeChannels.length - 1) {
                            yield new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
                        }
                    }
                    catch (error) {
                        console.error(`❌ Failed to restore channel ${channel.channelId}:`, error);
                        yield this.updateChannelStatus(channel.channelId, 'error');
                    }
                }
                console.log('✅ Channel restoration completed');
            }
            catch (error) {
                console.error('❌ Error during channel restoration:', error);
            }
        });
    }
    /**
     * Converts MongoDB Binary objects back to Node.js Buffers
     */
    convertBinaryToBuffer(obj) {
        if (!obj)
            return obj;
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
            const converted = {};
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
    createMongoAuthState(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Try to load existing creds
            let authState = yield WhatsAppAuthState_1.WhatsAppAuthState.findOne({ channelId });
            let creds;
            if (authState) {
                // Convert MongoDB Binary objects back to Buffers
                creds = this.convertBinaryToBuffer(authState.creds);
            }
            else {
                // Initialize new credentials
                creds = (0, baileys_1.initAuthCreds)();
                authState = new WhatsAppAuthState_1.WhatsAppAuthState({
                    channelId,
                    creds,
                });
                yield authState.save();
            }
            // Load existing keys
            const existingKeys = yield WhatsAppAuthState_1.WhatsAppAuthKey.find({ channelId });
            const keys = new Map();
            existingKeys.forEach((keyDoc) => {
                // Convert Binary objects back to Buffers for each key
                const convertedKeyData = this.convertBinaryToBuffer(keyDoc.keyData);
                keys.set(keyDoc.keyId, convertedKeyData);
            });
            return {
                creds,
                keys: {
                    get: (type, ids) => {
                        const result = {};
                        ids.forEach((id) => {
                            const key = keys.get(`${type}:${id}`);
                            if (key)
                                result[id] = key;
                        });
                        return result;
                    },
                    set: (data) => __awaiter(this, void 0, void 0, function* () {
                        const promises = [];
                        for (const category in data) {
                            for (const id in data[category]) {
                                const keyId = `${category}:${id}`;
                                const keyData = data[category][id];
                                keys.set(keyId, keyData);
                                promises.push(WhatsAppAuthState_1.WhatsAppAuthKey.findOneAndUpdate({ channelId, keyId }, { keyData }, { upsert: true, new: true }));
                            }
                        }
                        yield Promise.all(promises);
                    }),
                },
            };
        });
    }
    /**
     * Saves updated credentials to MongoDB
     */
    saveCreds(channelId, creds) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists before saving credentials
            if (!this.connections.has(channelId)) {
                console.log(`⚠️ Ignoring credential save for deleted channel: ${channelId}`);
                return;
            }
            yield WhatsAppAuthState_1.WhatsAppAuthState.findOneAndUpdate({ channelId }, { creds }, { upsert: true, new: true });
        });
    }
    /**
     * Connects or reconnects a WhatsApp channel
     */
    connectChannel(channelId, phoneNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`🔄 Connecting WhatsApp channel: ${channelId}`);
                // Update channel status
                yield this.updateChannelStatus(channelId, 'connecting');
                // Store phoneNumber in config if provided
                if (phoneNumber) {
                    yield this.updateChannelConfig(channelId, { phoneNumber });
                    console.log(`📱 Stored phoneNumber for ${channelId}: ${phoneNumber}`);
                }
                // For new connections, clear existing auth state to avoid Binary conversion issues
                const existingAuth = yield WhatsAppAuthState_1.WhatsAppAuthState.findOne({ channelId });
                if (!existingAuth) {
                    console.log(`🆕 Creating fresh auth state for new channel: ${channelId}`);
                }
                // Create auth state
                const auth = yield this.createMongoAuthState(channelId);
                // Create socket with Chrome Windows simulation for anti-ban
                // This simulates a real Chrome browser on Windows to reduce ban risk
                const sock = (0, baileys_1.default)({
                    auth,
                    browser: baileys_1.Browsers.windows('WhatsApp Web'),
                    printQRInTerminal: false,
                    markOnlineOnConnect: false,
                    syncFullHistory: false,
                    defaultQueryTimeoutMs: 60000,
                    emitOwnEvents: false,
                    // Implement cached group metadata to prevent rate limits and bans
                    cachedGroupMetadata: (jid) => __awaiter(this, void 0, void 0, function* () {
                        const cached = this.groupCache.get(jid);
                        if (cached) {
                            console.log(`📋 Using cached group metadata for ${jid}`);
                            return cached;
                        }
                        console.log(`🔍 No cached metadata found for group ${jid}`);
                        return undefined;
                    }),
                    // getMessage: async (key) => {
                    //   // Implement message retrieval from your database
                    //   return null;
                    // },
                });
                // Store connection
                this.connections.set(channelId, sock);
                this.connectionStatus.set(channelId, 'connecting');
                // Handle connection updates
                sock.ev.on('connection.update', (update) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handleConnectionUpdate(channelId, update, phoneNumber);
                }));
                // Handle credential updates
                sock.ev.on('creds.update', () => __awaiter(this, void 0, void 0, function* () {
                    yield this.saveCreds(channelId, auth.creds);
                }));
                // Handle incoming messages
                sock.ev.on('messages.upsert', (m) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handleIncomingMessages(channelId, m);
                }));
                // Handle message status updates
                sock.ev.on('messages.update', (updates) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handleMessageStatusUpdates(channelId, updates);
                }));
                // Handle groups update for metadata caching
                sock.ev.on('groups.update', (updates) => __awaiter(this, void 0, void 0, function* () {
                    console.log(`🔄 Groups updated for channel ${channelId}:`, updates.length);
                    // Only cache metadata that we already have or that's provided in the update
                    // Avoid fetching metadata to prevent rate limits as per Baileys documentation
                    for (const update of updates) {
                        try {
                            if (update.id) {
                                // Only cache if we have the actual metadata in the update
                                // Don't fetch it to avoid rate limits
                                if (update.participants || update.subject || update.desc) {
                                    console.log(`📋 Caching updated metadata for group ${update.id} (from update event)`);
                                    // Cache the partial update - Baileys will handle full metadata when needed
                                    const existingCache = this.groupCache.get(update.id) || {};
                                    const updatedMetadata = Object.assign(Object.assign({}, existingCache), update);
                                    this.groupCache.set(update.id, updatedMetadata);
                                }
                            }
                        }
                        catch (error) {
                            console.error(`❌ Error caching group metadata update for ${update.id}:`, error);
                        }
                    }
                }));
                // Handle incoming calls
                sock.ev.on('call', (callEvents) => __awaiter(this, void 0, void 0, function* () {
                    yield this.handleIncomingCalls(channelId, callEvents);
                }));
            }
            catch (error) {
                console.error(`❌ Error connecting channel ${channelId}:`, error);
                yield this.updateChannelStatus(channelId, 'error');
                this.emit('connection-update', channelId, 'error', error);
            }
        });
    }
    /**
     * Handles connection status updates
     */
    handleConnectionUpdate(channelId, update, phoneNumber) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists or is being disconnected before processing events
            const currentStatus = this.connectionStatus.get(channelId);
            if (!this.connections.has(channelId) && currentStatus !== 'disconnecting') {
                console.log(`⚠️ Ignoring connection update for deleted channel: ${channelId}`);
                return;
            }
            // Skip processing if channel is being disconnected or already disconnected
            if (currentStatus === 'disconnecting' || currentStatus === 'disconnected') {
                console.log(`⚠️ Ignoring connection update for ${currentStatus} channel: ${channelId}`);
                return;
            }
            const { connection, lastDisconnect, qr } = update;
            console.log(`📱 Connection update for ${channelId}:`, {
                connection,
                qr: !!qr,
            });
            if (qr) {
                // Generate QR code
                const qrDataURL = yield qrcode_1.default.toDataURL(qr);
                yield this.updateChannelStatus(channelId, 'qr_ready');
                // Store QR code in channel config
                yield this.updateChannelConfig(channelId, { qrCode: qrDataURL });
                this.emit('qr', channelId, qrDataURL);
            }
            if (connection === 'connecting' && phoneNumber) {
                // Request pairing code if phone number provided
                try {
                    const sock = this.connections.get(channelId);
                    if (sock && !sock.authState.creds.registered) {
                        const code = yield sock.requestPairingCode(phoneNumber);
                        yield this.updateChannelStatus(channelId, 'pairing_code_ready');
                        this.emit('pairing-code', channelId, code);
                    }
                }
                catch (error) {
                    console.error(`❌ Error requesting pairing code for ${channelId}:`, error);
                }
            }
            if (connection === 'close') {
                this.connections.delete(channelId);
                const shouldReconnect = ((_b = (_a = lastDisconnect === null || lastDisconnect === void 0 ? void 0 : lastDisconnect.error) === null || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode) !==
                    baileys_1.DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(`🔄 Reconnecting ${channelId}...`);
                    yield this.updateChannelStatus(channelId, 'connecting');
                    // Reconnect after 5 seconds
                    setTimeout(() => this.connectChannel(channelId, phoneNumber), 5000);
                }
                else {
                    console.log(`🚪 ${channelId} logged out`);
                    yield this.updateChannelStatus(channelId, 'logged_out');
                }
            }
            if (connection === 'open') {
                console.log(`✅ ${channelId} connected successfully`);
                yield this.updateChannelStatus(channelId, 'active');
                this.connectionStatus.set(channelId, 'active');
                // Reset preload attempts on successful connection
                this.preloadAttempts.delete(channelId);
                this.lastPreloadAttempt.delete(channelId);
                // Update channel config with phoneNumber if provided
                if (phoneNumber) {
                    yield this.updateChannelConfig(channelId, { phoneNumber });
                }
                // Get the connected phone number from Baileys and update config
                const sock = this.connections.get(channelId);
                if (sock && ((_c = sock.user) === null || _c === void 0 ? void 0 : _c.id)) {
                    const connectedPhoneNumber = sock.user.id.split(':')[0];
                    yield this.updateChannelConfig(channelId, {
                        phoneNumber: connectedPhoneNumber,
                        connectedAt: new Date(),
                    });
                    console.log(`📱 Captured connected phone number for ${channelId}: ${connectedPhoneNumber}`);
                }
                console.log(`📋 Group metadata caching enabled for ${channelId} - will cache on-demand to prevent rate limits (following Baileys best practices)`);
                console.log(`ℹ️ Skipping aggressive group preloading to prevent rate-overlimit errors as recommended by Baileys documentation`);
            }
            // Emit connection update event
            this.emit('connection-update', channelId, connection || 'unknown', lastDisconnect);
        });
    }
    /**
     * Handles incoming messages
     */
    handleIncomingMessages(channelId, messageUpdate) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists or is being disconnected before processing events
            const currentStatus = this.connectionStatus.get(channelId);
            if (!this.connections.has(channelId) || currentStatus === 'disconnecting' || currentStatus === 'disconnected') {
                console.log(`⚠️ Ignoring incoming message for ${currentStatus === 'disconnecting' ? 'disconnecting' : currentStatus === 'disconnected' ? 'disconnected' : 'deleted'} channel: ${channelId}`);
                return;
            }
            const { messages, type } = messageUpdate;
            if (type !== 'notify')
                return;
            for (const message of messages) {
                yield WhatsAppEvents_1.default.create({ channelId, payload: message });
                // Skip if message is from us
                if (message.key.fromMe)
                    continue;
                console.log(`📨 Incoming message for ${channelId}:`, JSON.stringify(message, null, 2));
                // Format message to webhook payload format
                const payload = yield this.formatMessageToWebhookPayload(channelId, message);
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
        });
    }
    /**
     * Sends payload to configured webhooks for a given event.
     */
    sendToWebhooks(channelId, event, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const channel = yield Channels_1.default.findOne({ channelId });
                if (!channel || !channel.webhooks || channel.webhooks.length === 0) {
                    return;
                }
                const webhooksToTrigger = channel.webhooks.filter((webhook) => webhook.isActive && webhook.events.includes(event));
                if (webhooksToTrigger.length === 0) {
                    return;
                }
                console.log(`🚀 Triggering ${webhooksToTrigger.length} webhooks for event '${event}' on channel ${channelId}`);
                const webhookPromises = webhooksToTrigger.map((webhook) => {
                    console.log(`  -> Sending to ${webhook.url}`);
                    return axios_1.default
                        .post(webhook.url, payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Channel-Id': channelId,
                            'X-Event': event,
                        },
                    })
                        .catch((error) => {
                        console.error(`❌ Error sending webhook to ${webhook.url}:`, error.message);
                        // We don't rethrow, just log the error to not stop other webhooks
                    });
                });
                yield Promise.all(webhookPromises);
            }
            catch (error) {
                console.error(`❌ Error processing webhooks for channel ${channelId}:`, error);
            }
        });
    }
    /**
     * Formats a Baileys message into a WhatsApp Cloud API-like webhook payload.
     */
    formatMessageToWebhookPayload(channelId, message) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                return null;
            }
            const from = message.key.remoteJid;
            const messageId = message.key.id;
            const timestamp = message.messageTimestamp;
            const contactName = message.pushName || from;
            const payload = {
                object: 'whatsapp_business_account',
                entry: [
                    {
                        id: channelId,
                        changes: [
                            {
                                value: {
                                    messaging_product: 'whatsapp',
                                    metadata: {
                                        display_phone_number: (_a = sock.user) === null || _a === void 0 ? void 0 : _a.id.split(':')[0],
                                        phone_number_id: (_b = sock.user) === null || _b === void 0 ? void 0 : _b.id,
                                    },
                                    contacts: [
                                        {
                                            profile: {
                                                name: contactName,
                                            },
                                            wa_id: (0, utils_1.removeSuffixFromJid)(from),
                                        },
                                    ],
                                    messages: [
                                        {
                                            from: (0, utils_1.removeSuffixFromJid)(from),
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
            let contextInfo;
            if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.conversation) {
                messageContainer.type = 'text';
                messageContainer.text = { body: messageContent.conversation };
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.extendedTextMessage) {
                messageContainer.type = 'text';
                messageContainer.text = { body: messageContent.extendedTextMessage.text };
                contextInfo = messageContent.extendedTextMessage.contextInfo;
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.imageMessage) {
                messageContainer.type = 'image';
                messageContainer.image = yield this.extractMediaPayload(channelId, message, 'image', messageContent.imageMessage);
                contextInfo = messageContent.imageMessage.contextInfo;
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.videoMessage) {
                messageContainer.type = 'video';
                messageContainer.video = yield this.extractMediaPayload(channelId, message, 'video', messageContent.videoMessage);
                contextInfo = messageContent.videoMessage.contextInfo;
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.audioMessage) {
                messageContainer.type = 'audio';
                messageContainer.audio = yield this.extractMediaPayload(channelId, message, 'audio', messageContent.audioMessage);
                contextInfo = messageContent.audioMessage.contextInfo;
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.documentMessage) {
                messageContainer.type = 'document';
                messageContainer.document = yield this.extractMediaPayload(channelId, message, 'document', messageContent.documentMessage);
                contextInfo = messageContent.documentMessage.contextInfo;
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.stickerMessage) {
                messageContainer.type = 'sticker';
                messageContainer.sticker = yield this.extractMediaPayload(channelId, message, 'sticker', messageContent.stickerMessage);
                contextInfo = messageContent.stickerMessage.contextInfo;
            }
            else if (messageContent === null || messageContent === void 0 ? void 0 : messageContent.reactionMessage) {
                messageContainer.type = 'reaction';
                messageContainer.reaction = {
                    message_id: messageContent.reactionMessage.key.id,
                    emoji: messageContent.reactionMessage.text,
                };
                console.log(`👍 Reaction message detected: ${messageContent.reactionMessage.text} on message ${messageContent.reactionMessage.key.id}`);
            }
            else {
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
                    from: (0, utils_1.removeSuffixFromJid)(contextInfo.participant),
                    id: contextInfo.stanzaId,
                    quotedMessage: contextInfo.quotedMessage,
                };
            }
            return payload;
        });
    }
    /**
     * Extracts media from a message, saves it, and returns the media payload.
     */
    extractMediaPayload(channelId, message, type, mediaMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const buffer = yield (0, baileys_1.downloadMediaMessage)(message, 'buffer', {});
                const fileExtension = mediaMessage.mimetype.split('/')[1].split(';')[0];
                const fileName = `${(0, uuid_1.v4)()}.${fileExtension}`;
                const storagePath = path_1.default.join(__dirname, `../../storage/${channelId}`);
                if (!fs_1.default.existsSync(storagePath)) {
                    fs_1.default.mkdirSync(storagePath, { recursive: true });
                }
                const filePath = path_1.default.join(storagePath, fileName);
                yield fs_1.default.promises.writeFile(filePath, buffer);
                const url = `${process.env.BACKEND_DOMAIN}/storage/${channelId}/${fileName}`;
                const payload = {
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
            }
            catch (error) {
                console.error(`❌ Error downloading media for message ${message.key.id}:`, error);
                return {
                    error: 'Failed to download media',
                };
            }
        });
    }
    /**
     * Formats a Baileys call event into a WhatsApp Cloud API-like webhook payload.
     */
    formatCallToWebhookPayload(channelId, callEvent) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
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
            const payload = {
                object: 'whatsapp_business_account',
                entry: [
                    {
                        id: channelId,
                        changes: [
                            {
                                value: {
                                    messaging_product: 'whatsapp',
                                    metadata: {
                                        display_phone_number: (_a = sock.user) === null || _a === void 0 ? void 0 : _a.id.split(':')[0],
                                        phone_number_id: (_b = sock.user) === null || _b === void 0 ? void 0 : _b.id,
                                    },
                                    statuses: [
                                        {
                                            id: callId,
                                            status: 'call_received',
                                            timestamp: timestamp,
                                            recipient_id: (_c = sock.user) === null || _c === void 0 ? void 0 : _c.id.split(':')[0],
                                            call: {
                                                from: (0, utils_1.removeSuffixFromJid)(from),
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
        });
    }
    /**
     * Formats a Baileys message status update into a WhatsApp Cloud API-like webhook payload.
     */
    formatStatusToWebhookPayload(channelId, statusUpdate) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                return null;
            }
            const messageId = statusUpdate.key.id;
            const to = statusUpdate.key.remoteJid;
            const numericStatus = (_a = statusUpdate.update) === null || _a === void 0 ? void 0 : _a.status; // Baileys sends numeric status codes
            const timestamp = statusUpdate.timestamp || Math.floor(Date.now() / 1000);
            // Map Baileys numeric status codes to WhatsApp Cloud API status strings
            // Based on actual behavior observed in logs:
            // 0: pending/sent, 1: sent (server received), 2: sent, 3: delivered, 4: read
            let webhookStatus;
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
            const payload = {
                object: 'whatsapp_business_account',
                entry: [
                    {
                        id: channelId,
                        changes: [
                            {
                                value: {
                                    messaging_product: 'whatsapp',
                                    metadata: {
                                        display_phone_number: (_b = sock.user) === null || _b === void 0 ? void 0 : _b.id.split(':')[0],
                                        phone_number_id: (_c = sock.user) === null || _c === void 0 ? void 0 : _c.id,
                                    },
                                    statuses: [
                                        {
                                            id: messageId,
                                            status: webhookStatus,
                                            timestamp: timestamp,
                                            recipient_id: (0, utils_1.removeSuffixFromJid)(to),
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
                    id: (0, utils_1.removeSuffixFromJid)(to),
                    origin: {
                        type: 'user_initiated',
                    },
                };
            }
            console.log(`📊 Formatted status update for ${channelId}: ${webhookStatus} (code: ${numericStatus}) for message ${messageId}`);
            return payload;
        });
    }
    /**
     * Handles message status updates (sent, delivered, read)
     */
    handleMessageStatusUpdates(channelId, updates) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists or is being disconnected before processing events
            const currentStatus = this.connectionStatus.get(channelId);
            if (!this.connections.has(channelId) || currentStatus === 'disconnecting' || currentStatus === 'disconnected') {
                console.log(`⚠️ Ignoring message status update for ${currentStatus === 'disconnecting' ? 'disconnecting' : currentStatus === 'disconnected' ? 'disconnected' : 'deleted'} channel: ${channelId}`);
                return;
            }
            for (const update of updates) {
                console.log(`📊 Message status update for ${channelId}:`, JSON.stringify(update, null, 2));
                // Format status update to webhook payload format
                const payload = yield this.formatStatusToWebhookPayload(channelId, update);
                console.log("Status payload formatted:", JSON.stringify(payload, null, 2));
                if (payload) {
                    // Emit status update event
                    this.emit('message-status', channelId, payload);
                    // Determine webhook event type based on status from the formatted payload
                    const webhookStatus = (_d = (_c = (_b = (_a = payload.entry[0]) === null || _a === void 0 ? void 0 : _a.changes[0]) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.statuses[0]) === null || _d === void 0 ? void 0 : _d.status;
                    let webhookEventType = 'message.status';
                    if (webhookStatus === 'sent') {
                        webhookEventType = 'message.sent';
                    }
                    else if (webhookStatus === 'delivered') {
                        webhookEventType = 'message.delivered';
                    }
                    else if (webhookStatus === 'read') {
                        webhookEventType = 'message.read';
                    }
                    // Send to webhooks
                    this.sendToWebhooks(channelId, webhookEventType, payload);
                }
                // TODO: Update NotificationLogs collection
                // await this.updateMessageStatus(channelId, update);
            }
        });
    }
    /**
     * Handles incoming calls
     */
    handleIncomingCalls(channelId, callEvents) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists or is being disconnected before processing events
            const currentStatus = this.connectionStatus.get(channelId);
            if (!this.connections.has(channelId) || currentStatus === 'disconnecting' || currentStatus === 'disconnected') {
                console.log(`⚠️ Ignoring incoming call for ${currentStatus === 'disconnecting' ? 'disconnecting' : currentStatus === 'disconnected' ? 'disconnected' : 'deleted'} channel: ${channelId}`);
                return;
            }
            for (const callEvent of callEvents) {
                console.log(`📞 Incoming call for ${channelId}:`, JSON.stringify(callEvent, null, 2));
                // Save call event to database
                yield WhatsAppEvents_1.default.create({ channelId, payload: callEvent });
                // Format call event to webhook payload format
                const payload = yield this.formatCallToWebhookPayload(channelId, callEvent);
                console.log("Call payload formatted:", JSON.stringify(payload, null, 2));
                if (payload) {
                    // Emit call event
                    this.emit('call', channelId, payload);
                    // Send to webhooks
                    this.sendToWebhooks(channelId, 'call.received', payload);
                }
            }
        });
    }
    /**
     * Sends a text message
     */
    sendTextMessage(channelId, to, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                throw new Error(`Channel ${channelId} is not connected`);
            }
            try {
                const message = yield sock.sendMessage(to, { text });
                console.log(`📤 Message sent from ${channelId} to ${to}`);
                return message;
            }
            catch (error) {
                console.error(`❌ Error sending message from ${channelId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Sends a media message
     */
    sendMediaMessage(channelId, to, mediaType, media, caption) {
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                throw new Error(`Channel ${channelId} is not connected`);
            }
            try {
                const messageContent = {};
                messageContent[mediaType] = media;
                if (caption)
                    messageContent.caption = caption;
                const message = yield sock.sendMessage(to, messageContent);
                console.log(`📤 Media message sent from ${channelId} to ${to}`);
                return message;
            }
            catch (error) {
                console.error(`❌ Error sending media message from ${channelId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Disconnects a channel
     */
    disconnectChannel(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
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
                        yield sock.logout();
                        console.log(`📱 Successfully logged out from WhatsApp for channel: ${channelId}`);
                    }
                    catch (logoutError) {
                        console.warn(`⚠️ Error during logout for channel ${channelId}:`, logoutError);
                        // Continue with cleanup even if logout fails
                    }
                    // Clean up memory status
                    this.connectionStatus.delete(channelId);
                    // Update database status
                    yield this.updateChannelStatus(channelId, 'disconnected');
                    console.log(`✅ Channel ${channelId} disconnected successfully`);
                }
                else {
                    console.log(`⚠️ Channel ${channelId} was not connected`);
                    // Still update status in case it was marked as active in DB
                    yield this.updateChannelStatus(channelId, 'disconnected');
                }
            }
            catch (error) {
                console.error(`❌ Error disconnecting channel ${channelId}:`, error);
                // Ensure cleanup even on error
                this.connections.delete(channelId);
                this.connectionStatus.delete(channelId);
                yield this.updateChannelStatus(channelId, 'error');
                throw error;
            }
        });
    }
    /**
     * Gets connection status for a channel
     */
    getChannelStatus(channelId) {
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
    getChannelStatusFromDB(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const channel = yield Channels_1.default.findOne({ channelId });
                return (channel === null || channel === void 0 ? void 0 : channel.status) || 'inactive';
            }
            catch (error) {
                console.error(`❌ Error getting channel status from DB for ${channelId}:`, error);
                return 'inactive';
            }
        });
    }
    /**
     * Syncs memory status with database status (useful after server restart)
     */
    syncChannelStatus(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const dbStatus = yield this.getChannelStatusFromDB(channelId);
                // If database shows active status but memory shows inactive, update memory
                if (dbStatus !== 'inactive' &&
                    this.connectionStatus.get(channelId) === undefined) {
                    console.log(`🔄 Syncing status for channel ${channelId}: ${dbStatus}`);
                    this.connectionStatus.set(channelId, dbStatus);
                }
                return dbStatus;
            }
            catch (error) {
                console.error(`❌ Error syncing channel status for ${channelId}:`, error);
                return 'inactive';
            }
        });
    }
    /**
     * Completely removes a channel from memory and prevents future events
     */
    removeChannel(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`🗑️ Removing channel ${channelId} from WhatsApp service...`);
                // Close and remove the socket connection if it exists
                const socket = this.connections.get(channelId);
                if (socket) {
                    console.log(`🔌 Closing socket connection for channel ${channelId}`);
                    try {
                        // Gracefully close the Baileys connection
                        yield socket.logout();
                    }
                    catch (error) {
                        console.warn(`⚠️ Error closing socket for ${channelId}:`, error);
                    }
                }
                // Remove from all memory maps
                this.connections.delete(channelId);
                this.connectionStatus.delete(channelId);
                this.preloadAttempts.delete(channelId);
                this.lastPreloadAttempt.delete(channelId);
                // Clear auth state if it exists
                yield this.clearAuthState(channelId);
                // Clear phone validation cache for this channel
                this.clearPhoneValidationCache(channelId);
                console.log(`✅ Channel ${channelId} removed from WhatsApp service memory`);
            }
            catch (error) {
                console.error(`❌ Error removing channel ${channelId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Gets all active connections
     */
    getActiveConnections() {
        return Array.from(this.connections.keys());
    }
    /**
     * Updates channel status in database
     */
    updateChannelStatus(channelId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield Channels_1.default.findOneAndUpdate({ channelId }, {
                    status,
                    lastStatusUpdate: new Date(),
                });
            }
            catch (error) {
                console.error(`❌ Error updating channel status for ${channelId}:`, error);
            }
        });
    }
    /**
     * Updates channel config with phoneNumber and other WhatsApp-specific data
     */
    updateChannelConfig(channelId, configUpdate) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const channel = yield Channels_1.default.findOne({ channelId });
                if (channel) {
                    // Merge the new config with existing config
                    const updatedConfig = Object.assign(Object.assign({}, channel.config), configUpdate);
                    yield Channels_1.default.findOneAndUpdate({ channelId }, {
                        config: updatedConfig,
                        lastStatusUpdate: new Date(),
                    });
                    console.log(`📝 Updated config for channel ${channelId}:`, configUpdate);
                }
            }
            catch (error) {
                console.error(`❌ Error updating channel config for ${channelId}:`, error);
            }
        });
    }
    /**
     * Refreshes QR code for an existing channel by clearing auth state and reconnecting
     */
    refreshQRCode(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(`🔄 Refreshing QR code for channel: ${channelId}`);
                // Step 1: Disconnect current connection if exists
                const currentConnection = this.connections.get(channelId);
                if (currentConnection) {
                    console.log(`🔌 Disconnecting current connection for ${channelId}`);
                    try {
                        yield currentConnection.logout();
                    }
                    catch (error) {
                        console.warn(`⚠️ Error during logout for ${channelId}:`, error);
                    }
                    this.connections.delete(channelId);
                }
                // Step 2: Clear auth state to force fresh QR generation
                console.log(`🧹 Clearing auth state for ${channelId} to generate fresh QR`);
                yield this.clearAuthState(channelId);
                // Step 3: Update channel status
                yield this.updateChannelStatus(channelId, 'generating_qr');
                this.connectionStatus.set(channelId, 'generating_qr');
                // Step 4: Clear any cached config QR code
                yield this.updateChannelConfig(channelId, { qrCode: null });
                // Step 5: Reconnect to generate new QR code
                console.log(`🔄 Starting fresh connection for ${channelId}`);
                yield this.connectChannel(channelId);
                console.log(`✅ QR refresh initiated for channel: ${channelId}`);
            }
            catch (error) {
                console.error(`❌ Error refreshing QR code for ${channelId}:`, error);
                yield this.updateChannelStatus(channelId, 'error');
                throw error;
            }
        });
    }
    /**
     * Cleanup method
     */
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🧹 Cleaning up WhatsApp connections...');
            const disconnectPromises = Array.from(this.connections.keys()).map((channelId) => this.disconnectChannel(channelId));
            yield Promise.all(disconnectPromises);
            // Clear all cached group metadata
            this.clearGroupCache();
            // Clear phone validation cache
            this.clearPhoneValidationCache();
            // Clear all tracking maps
            this.preloadAttempts.clear();
            this.lastPreloadAttempt.clear();
        });
    }
    /**
     * Clears auth state for a channel (useful for debugging)
     */
    clearAuthState(channelId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield WhatsAppAuthState_1.WhatsAppAuthState.deleteMany({ channelId });
                yield WhatsAppAuthState_1.WhatsAppAuthKey.deleteMany({ channelId });
                console.log(`🧹 Cleared auth state for channel: ${channelId}`);
            }
            catch (error) {
                console.error(`❌ Error clearing auth state for ${channelId}:`, error);
            }
        });
    }
    /**
     * DEPRECATED: Manual group metadata preloading is discouraged by Baileys documentation
     * as it causes rate-overlimit errors. The cachedGroupMetadata function handles this automatically.
     *
     * This method is kept for backward compatibility but should not be used.
     * See: https://baileys.wiki/docs/socket/configuration#cachedgroupmetadata
     */
    preloadGroupMetadata() {
        return __awaiter(this, void 0, void 0, function* () {
            console.warn(`⚠️ preloadGroupMetadata is deprecated - Baileys handles group metadata caching automatically to prevent rate limits`);
            console.warn(`ℹ️ See: https://baileys.wiki/docs/socket/configuration#cachedgroupmetadata`);
            // Don't actually preload - let Baileys handle it on-demand
            return;
        });
    }
    /**
     * Clears cached group metadata for a specific channel or all channels
     */
    clearGroupCache(channelId) {
        if (channelId) {
            // Clear cache entries for specific channel (if we had channel-specific keys)
            console.log(`🧹 Clearing group cache for channel: ${channelId}`);
            // Since we're using JID as keys, we can't easily filter by channel
            // This would require a more complex key structure if needed
        }
        else {
            // Clear all cached group metadata
            this.groupCache.flushAll();
            console.log('🧹 Cleared all cached group metadata');
        }
    }
    /**
     * Clears phone validation cache for a specific channel or all channels
     */
    clearPhoneValidationCache(channelId) {
        if (channelId) {
            // Clear cache entries for specific channel
            const keys = this.phoneValidationCache.keys();
            const channelKeys = keys.filter(key => key.startsWith(`${channelId}:`));
            this.phoneValidationCache.del(channelKeys);
            console.log(`🧹 Cleared phone validation cache for channel: ${channelId} (${channelKeys.length} entries)`);
        }
        else {
            // Clear all cached phone validations
            const totalKeys = this.phoneValidationCache.keys().length;
            this.phoneValidationCache.flushAll();
            console.log(`🧹 Cleared all phone validation cache (${totalKeys} entries)`);
        }
    }
    /**
     * Invalidates cache for a specific phone number
     */
    invalidatePhoneValidation(channelId, phoneNumber) {
        const cacheKey = `${channelId}:${phoneNumber}`;
        const wasDeleted = this.phoneValidationCache.del(cacheKey);
        if (wasDeleted) {
            console.log(`🗑️ Invalidated phone validation cache for: ${phoneNumber}`);
        }
        else {
            console.log(`ℹ️ No cache entry found for phone number: ${phoneNumber}`);
        }
    }
    /**
     * Gets phone validation cache statistics
     */
    getPhoneValidationCacheStats() {
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
    validatePhoneNumberWithCache(channelId, phoneNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = `${channelId}:${phoneNumber}`;
            // Check if validation result is cached
            const cachedResult = this.phoneValidationCache.get(cacheKey);
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
                const validation = yield this.checkIdExists(channelId, phoneNumber);
                // Cache the validation result
                this.phoneValidationCache.set(cacheKey, validation.exists);
                if (!validation.exists) {
                    console.log(`❌ Phone number ${phoneNumber} is not registered on WhatsApp (cached for future use)`);
                    throw new Error(`Phone number ${phoneNumber} is not registered on WhatsApp`);
                }
                console.log(`✅ Phone number ${phoneNumber} is valid on WhatsApp (cached for future use)`);
            }
            catch (error) {
                if (error.message.includes('not registered on WhatsApp')) {
                    throw error; // Re-throw our custom error
                }
                console.error(`❌ Error validating phone number ${phoneNumber}:`, error);
                throw new Error(`Failed to validate phone number ${phoneNumber}. Please check the number format and try again.`);
            }
        });
    }
    /**
     * Sends a message using a format similar to the WhatsApp Cloud API.
     * This handles both single and bulk messages, including replies with context.
     */
    sendMessageFromApi(channelId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield this.validatePhoneNumberWithCache(channelId, originalNumber);
            let messageContent;
            // Handle context for replies
            let quotedMessage = null;
            if (payload.context && payload.context.message_id) {
                console.log(`🔄 Looking up original message for reply: ${payload.context.message_id}`);
                try {
                    // Look up the original message from WhatsAppEvents collection
                    const originalMessageDoc = yield WhatsAppEvents_1.default.findOne({
                        channelId,
                        'payload.key.id': payload.context.message_id,
                    }).sort({ createdAt: -1 }); // Get the most recent match
                    if (originalMessageDoc && originalMessageDoc.payload) {
                        quotedMessage = originalMessageDoc.payload;
                        console.log(`✅ Found original message for reply: ${payload.context.message_id}`);
                    }
                    else {
                        console.warn(`⚠️ Original message not found for reply: ${payload.context.message_id}`);
                    }
                }
                catch (error) {
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
                case 'audio': {
                    const mediaUrl = payload[payload.type].link;
                    const caption = payload[payload.type].caption;
                    if (!mediaUrl) {
                        throw new Error(`"link" is required for media type "${payload.type}"`);
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
            console.log("Quoted message:", quotedMessage);
            try {
                let message;
                // Send message with quoted reply if context is provided
                if (quotedMessage) {
                    console.log(`📝 Sending reply to message: ${payload.context.message_id}`);
                    message = yield sock.sendMessage(to, messageContent, { quoted: quotedMessage });
                }
                else {
                    message = yield sock.sendMessage(to, messageContent);
                }
                console.log(`📤 Message sent from ${channelId} to ${to}${quotedMessage ? ' (reply)' : ''}`);
                return message;
            }
            catch (error) {
                console.error(`❌ Error sending message from ${channelId}:`, error);
                throw error;
            }
        });
    }
    /**
     * Checks if a given ID (JID) exists on WhatsApp.
     */
    checkIdExists(channelId, jid) {
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                throw new Error(`Channel ${channelId} is not connected`);
            }
            const [result] = yield sock.onWhatsApp(jid);
            if (result) {
                return { jid: result.jid, exists: !!result.exists };
            }
            return { exists: false, jid };
        });
    }
    /**
     * Fetches the status of a contact.
     */
    fetchContactStatus(channelId, jid) {
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                throw new Error(`Channel ${channelId} is not connected`);
            }
            try {
                const status = yield sock.fetchStatus(jid);
                return status;
            }
            catch (error) {
                console.error(`❌ Error fetching status for ${jid}:`, error);
                // It often fails if the user doesn't have a status or has privacy settings
                return undefined;
            }
        });
    }
    /**
     * Fetches the profile picture URL of a contact or group.
     */
    fetchProfilePictureUrl(channelId, jid, type = 'preview') {
        return __awaiter(this, void 0, void 0, function* () {
            const sock = this.connections.get(channelId);
            if (!sock) {
                throw new Error(`Channel ${channelId} is not connected`);
            }
            try {
                const url = yield sock.profilePictureUrl(jid, type);
                return url;
            }
            catch (error) {
                console.error(`❌ Error fetching profile picture for ${jid}:`, error);
                // This can fail if the user has no profile picture or due to privacy settings
                return undefined;
            }
        });
    }
    /**
     * Downloads and saves a profile picture locally, returning the local URL.
     */
    downloadAndSaveProfilePicture(channelId, jid, type = 'preview') {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // First get the profile picture URL from WhatsApp
                const profilePictureUrl = yield this.fetchProfilePictureUrl(channelId, jid, type);
                if (!profilePictureUrl) {
                    return undefined;
                }
                // Download the image
                const response = yield axios_1.default.get(profilePictureUrl, {
                    responseType: 'arraybuffer',
                    timeout: 30000, // 30 second timeout
                });
                const buffer = Buffer.from(response.data);
                // Determine file extension from content type or default to jpg
                const contentType = response.headers['content-type'];
                let fileExtension = 'jpg';
                if (contentType) {
                    if (contentType.includes('png'))
                        fileExtension = 'png';
                    else if (contentType.includes('gif'))
                        fileExtension = 'gif';
                    else if (contentType.includes('webp'))
                        fileExtension = 'webp';
                }
                // Create filename with sanitized JID
                const sanitizedJid = jid.replace(/[@.]/g, '_');
                const fileName = `profile_${sanitizedJid}_${type}_${Date.now()}.${fileExtension}`;
                // Ensure storage directory exists
                const storagePath = path_1.default.join(__dirname, `../../storage/${channelId}`);
                if (!fs_1.default.existsSync(storagePath)) {
                    fs_1.default.mkdirSync(storagePath, { recursive: true });
                }
                // Save the file
                const filePath = path_1.default.join(storagePath, fileName);
                yield fs_1.default.promises.writeFile(filePath, buffer);
                // Return the public URL
                const publicUrl = `${process.env.BACKEND_DOMAIN}/storage/${channelId}/${fileName}`;
                console.log(`📸 Profile picture saved for ${jid}: ${publicUrl}`);
                return publicUrl;
            }
            catch (error) {
                console.error(`❌ Error downloading and saving profile picture for ${jid}:`, error);
                return undefined;
            }
        });
    }
}
exports.WhatsAppService = WhatsAppService;
// Singleton instance
exports.whatsAppService = new WhatsAppService();
//# sourceMappingURL=WhatsAppService.js.map