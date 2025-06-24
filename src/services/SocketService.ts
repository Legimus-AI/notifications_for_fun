import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { whatsAppService } from './WhatsAppService';

export class SocketService {
  private io: SocketIOServer;
  private connectedClients: Map<string, string[]> = new Map(); // apiKeyId -> socketIds

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
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

  private setupSocketEvents() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Authentication - client should send their API key
      socket.on('authenticate', (data: { apiKey: string }) => {
        try {
          // TODO: Validate API key here
          const apiKeyId = data.apiKey; // In real implementation, decode JWT or validate API key

          // Store client mapping
          if (!this.connectedClients.has(apiKeyId)) {
            this.connectedClients.set(apiKeyId, []);
          }
          this.connectedClients.get(apiKeyId)!.push(socket.id);

          // Join room based on API key
          socket.join(`api_${apiKeyId}`);

          console.log(
            `✅ Client ${socket.id} authenticated for API key: ${apiKeyId}`,
          );

          socket.emit('authenticated', { success: true });
        } catch (error) {
          console.error(`❌ Authentication failed for ${socket.id}:`, error);
          socket.emit('authentication_error', { error: 'Invalid API key' });
        }
      });

      // Handle channel subscription
      socket.on('subscribe_channel', async (data: { channelId: string }) => {
        console.log('Subscribing to channel:', data.channelId);
        socket.join(`channel_${data.channelId}`);
        console.log(
          `📺 Client ${socket.id} subscribed to channel: ${data.channelId}`,
        );

        // Send current channel status (check memory first, then DB if needed)
        let status = whatsAppService.getChannelStatus(data.channelId);

        // If memory shows inactive but we want to check DB for actual status
        if (status === 'inactive') {
          const dbStatus = await whatsAppService.getChannelStatusFromDB(
            data.channelId,
          );
          if (dbStatus !== 'inactive') {
            // Use the database status as it's more persistent
            status = dbStatus;
          }
        }

        socket.emit('channel_status', {
          channelId: data.channelId,
          status,
        });
      });

      // Handle channel unsubscription
      socket.on('unsubscribe_channel', (data: { channelId: string }) => {
        socket.leave(`channel_${data.channelId}`);
        console.log(
          `📺 Client ${socket.id} unsubscribed from channel: ${data.channelId}`,
        );
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

  private setupWhatsAppServiceListeners() {
    // Listen for QR codes
    whatsAppService.on('qr', (channelId: string, qrDataURL: string) => {
      console.log(`📱 QR code generated for channel: ${channelId}`);
      this.io.to(`channel_${channelId}`).emit('qr_code', {
        channelId,
        qrCode: qrDataURL,
        timestamp: new Date().toISOString(),
      });
    });

    // Listen for pairing codes
    whatsAppService.on('pairing-code', (channelId: string, code: string) => {
      console.log(`🔢 Pairing code generated for channel: ${channelId}`);
      this.io.to(`channel_${channelId}`).emit('pairing_code', {
        channelId,
        code,
        timestamp: new Date().toISOString(),
      });
    });

    // Listen for connection updates
    whatsAppService.on(
      'connection-update',
      (channelId: string, status: string, lastDisconnect?: any) => {
        console.log(`📊 Connection update for channel ${channelId}: ${status}`);

        const updateData: any = {
          channelId,
          status,
          timestamp: new Date().toISOString(),
        };

        if (lastDisconnect) {
          updateData.lastDisconnect = {
            reason: lastDisconnect.error?.output?.statusCode,
            message: lastDisconnect.error?.message,
          };
        }

        this.io
          .to(`channel_${channelId}`)
          .emit('connection_update', updateData);
      },
    );

    // Listen for incoming messages
    whatsAppService.on('message', (channelId: string, message: any) => {
      console.log(`💬 Incoming message for channel: ${channelId}`);

      const messageData = {
        channelId,
        messageId: message.key.id,
        from: message.key.remoteJid,
        timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
        message: message.message,
        type: 'incoming',
      };

      this.io.to(`channel_${channelId}`).emit('incoming_message', messageData);
    });

    // Listen for message status updates
    whatsAppService.on('message-status', (channelId: string, status: any) => {
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
  public emitToChannel(channelId: string, event: string, data: any) {
    this.io.to(`channel_${channelId}`).emit(event, data);
  }

  /**
   * Send custom event to specific API key clients
   */
  public emitToApiKey(apiKeyId: string, event: string, data: any) {
    this.io.to(`api_${apiKeyId}`).emit(event, data);
  }

  /**
   * Send broadcast to all connected clients
   */
  public broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  /**
   * Get connected clients count
   */
  public getConnectedClientsCount(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * Get connected clients for specific API key
   */
  public getConnectedClientsForApiKey(apiKeyId: string): number {
    return this.connectedClients.get(apiKeyId)?.length || 0;
  }

  /**
   * Cleanup method
   */
  public async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Socket.io connections...');
    this.io.close();
  }
}

// Export singleton instance (will be initialized in main app)
export let socketService: SocketService;
