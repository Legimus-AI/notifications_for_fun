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
const WhatsAppAuthState_1 = require("../models/WhatsAppAuthState");
const Channels_1 = __importDefault(require("../models/Channels"));
const events_1 = require("events");
class WhatsAppService extends events_1.EventEmitter {
    constructor() {
        super();
        this.connections = new Map();
        this.connectionStatus = new Map();
    }
    /**
     * Restores all active channels on server restart
     */
    restoreActiveChannels() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('🔄 Restoring active WhatsApp channels...');
                // Find all channels that were active before server restart
                const activeChannels = yield Channels_1.default.find({
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
                // For new connections, clear existing auth state to avoid Binary conversion issues
                const existingAuth = yield WhatsAppAuthState_1.WhatsAppAuthState.findOne({ channelId });
                if (!existingAuth) {
                    console.log(`🆕 Creating fresh auth state for new channel: ${channelId}`);
                }
                // Create auth state
                const auth = yield this.createMongoAuthState(channelId);
                // Create socket
                const sock = (0, baileys_1.default)({
                    auth,
                    browser: baileys_1.Browsers.ubuntu('Multi-Channel Notifications'),
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
                    // Implement group metadata caching if needed
                    console.log('Groups updated:', updates);
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
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists before processing events
            if (!this.connections.has(channelId)) {
                console.log(`⚠️ Ignoring connection update for deleted channel: ${channelId}`);
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
            // Check if channel still exists before processing events
            if (!this.connections.has(channelId)) {
                console.log(`⚠️ Ignoring incoming message for deleted channel: ${channelId}`);
                return;
            }
            const { messages, type } = messageUpdate;
            if (type !== 'notify')
                return;
            for (const message of messages) {
                // Skip if message is from us
                if (message.key.fromMe)
                    continue;
                console.log(`📨 Incoming message for ${channelId}:`, message);
                // Emit message event
                this.emit('message', channelId, message);
                // TODO: Save to NotificationLogs collection
                // await this.saveIncomingMessage(channelId, message);
            }
        });
    }
    /**
     * Handles message status updates (sent, delivered, read)
     */
    handleMessageStatusUpdates(channelId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if channel still exists before processing events
            if (!this.connections.has(channelId)) {
                console.log(`⚠️ Ignoring message status update for deleted channel: ${channelId}`);
                return;
            }
            for (const update of updates) {
                console.log(`📊 Message status update for ${channelId}:`, update);
                // Emit status update event
                this.emit('message-status', channelId, update);
                // TODO: Update NotificationLogs collection
                // await this.updateMessageStatus(channelId, update);
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
            const sock = this.connections.get(channelId);
            if (sock) {
                yield sock.logout();
                this.connections.delete(channelId);
                yield this.updateChannelStatus(channelId, 'inactive');
                console.log(`🚪 Channel ${channelId} disconnected`);
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
                // Clear auth state if it exists
                yield this.clearAuthState(channelId);
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
     * Cleanup method
     */
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🧹 Cleaning up WhatsApp connections...');
            const disconnectPromises = Array.from(this.connections.keys()).map((channelId) => this.disconnectChannel(channelId));
            yield Promise.all(disconnectPromises);
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
}
exports.WhatsAppService = WhatsAppService;
// Singleton instance
exports.whatsAppService = new WhatsAppService();
//# sourceMappingURL=WhatsAppService.js.map