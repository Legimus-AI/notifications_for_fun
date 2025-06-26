"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketService = exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
const WhatsAppService_1 = require("./WhatsAppService");
class SocketService {
    constructor(httpServer) {
        this.connectedClients = new Map(); // apiKeyId -> socketIds
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URL || 'http://localhost:3030',
                methods: ['GET', 'POST'],
                credentials: true,
            },
            path: '/socket.io/',
        });
        this.setupSocketEvents();
        this.setupWhatsAppServiceListeners();
    }
    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);
            // Authentication - client should send their API key
            socket.on('authenticate', (data) => {
                try {
                    // TODO: Validate API key here
                    const apiKeyId = data.apiKey; // In real implementation, decode JWT or validate API key
                    // Store client mapping
                    if (!this.connectedClients.has(apiKeyId)) {
                        this.connectedClients.set(apiKeyId, []);
                    }
                    this.connectedClients.get(apiKeyId).push(socket.id);
                    // Join room based on API key
                    socket.join(`api_${apiKeyId}`);
                    console.log(`✅ Client ${socket.id} authenticated for API key: ${apiKeyId}`);
                    socket.emit('authenticated', { success: true });
                }
                catch (error) {
                    console.error(`❌ Authentication failed for ${socket.id}:`, error);
                    socket.emit('authentication_error', { error: 'Invalid API key' });
                }
            });
            // Handle channel subscription
            socket.on('subscribe_channel', (data) => __awaiter(this, void 0, void 0, function* () {
                console.log('Subscribing to channel:', data.channelId);
                socket.join(`channel_${data.channelId}`);
                console.log(`📺 Client ${socket.id} subscribed to channel: ${data.channelId}`);
                // Send current channel status (check memory first, then DB if needed)
                let status = WhatsAppService_1.whatsAppService.getChannelStatus(data.channelId);
                // If memory shows inactive but we want to check DB for actual status
                if (status === 'inactive') {
                    const dbStatus = yield WhatsAppService_1.whatsAppService.getChannelStatusFromDB(data.channelId);
                    if (dbStatus !== 'inactive') {
                        // Use the database status as it's more persistent
                        status = dbStatus;
                    }
                }
                socket.emit('channel_status', {
                    channelId: data.channelId,
                    status,
                });
            }));
            // Handle channel unsubscription
            socket.on('unsubscribe_channel', (data) => {
                socket.leave(`channel_${data.channelId}`);
                console.log(`📺 Client ${socket.id} unsubscribed from channel: ${data.channelId}`);
            });
            // Handle disconnection
            socket.on('disconnect', () => {
                console.log(`🔌 Socket client disconnected: ${socket.id}`);
                // Remove from client mappings
                for (const [apiKeyId, socketIds] of this.connectedClients.entries()) {
                    const index = socketIds.indexOf(socket.id);
                    if (index > -1) {
                        socketIds.splice(index, 1);
                        if (socketIds.length === 0) {
                            this.connectedClients.delete(apiKeyId);
                        }
                        break;
                    }
                }
            });
            // Handle ping/pong for connection health
            socket.on('ping', () => {
                socket.emit('pong');
            });
        });
    }
    setupWhatsAppServiceListeners() {
        // Listen for QR codes
        WhatsAppService_1.whatsAppService.on('qr', (channelId, qrDataURL) => {
            console.log(`📱 QR code generated for channel: ${channelId}`);
            this.io.to(`channel_${channelId}`).emit('qr_code', {
                channelId,
                qrCode: qrDataURL,
                timestamp: new Date().toISOString(),
            });
        });
        // Listen for pairing codes
        WhatsAppService_1.whatsAppService.on('pairing-code', (channelId, code) => {
            console.log(`🔢 Pairing code generated for channel: ${channelId}`);
            this.io.to(`channel_${channelId}`).emit('pairing_code', {
                channelId,
                code,
                timestamp: new Date().toISOString(),
            });
        });
        // Listen for connection updates
        WhatsAppService_1.whatsAppService.on('connection-update', (channelId, status, lastDisconnect) => {
            var _a, _b, _c;
            console.log(`📊 Connection update for channel ${channelId}: ${status}`);
            const updateData = {
                channelId,
                status,
                timestamp: new Date().toISOString(),
            };
            if (lastDisconnect) {
                updateData.lastDisconnect = {
                    reason: (_b = (_a = lastDisconnect.error) === null || _a === void 0 ? void 0 : _a.output) === null || _b === void 0 ? void 0 : _b.statusCode,
                    message: (_c = lastDisconnect.error) === null || _c === void 0 ? void 0 : _c.message,
                };
            }
            this.io
                .to(`channel_${channelId}`)
                .emit('connection_update', updateData);
        });
        // Listen for incoming messages
        WhatsAppService_1.whatsAppService.on('message', (channelId, payload) => {
            console.log(`💬 Incoming message for channel: ${channelId}`);
            this.io.to(`channel_${channelId}`).emit('incoming_message', payload);
        });
        // Listen for message status updates
        WhatsAppService_1.whatsAppService.on('message-status', (channelId, status) => {
            console.log(`📨 Message status update for channel: ${channelId}`);
            const statusData = {
                channelId,
                messageId: status.key.id,
                status: status.update,
                timestamp: new Date().toISOString(),
            };
            this.io
                .to(`channel_${channelId}`)
                .emit('message_status_update', statusData);
        });
    }
    /**
     * Send custom event to specific channel subscribers
     */
    emitToChannel(channelId, event, data) {
        this.io.to(`channel_${channelId}`).emit(event, data);
    }
    /**
     * Send custom event to specific API key clients
     */
    emitToApiKey(apiKeyId, event, data) {
        this.io.to(`api_${apiKeyId}`).emit(event, data);
    }
    /**
     * Send broadcast to all connected clients
     */
    broadcast(event, data) {
        this.io.emit(event, data);
    }
    /**
     * Get connected clients count
     */
    getConnectedClientsCount() {
        return this.io.sockets.sockets.size;
    }
    /**
     * Get connected clients for specific API key
     */
    getConnectedClientsForApiKey(apiKeyId) {
        var _a;
        return ((_a = this.connectedClients.get(apiKeyId)) === null || _a === void 0 ? void 0 : _a.length) || 0;
    }
    /**
     * Cleanup method
     */
    cleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('🧹 Cleaning up Socket.io connections...');
            this.io.close();
        });
    }
}
exports.SocketService = SocketService;
//# sourceMappingURL=SocketService.js.map