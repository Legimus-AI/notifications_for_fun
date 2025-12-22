import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { computeCheck } from 'telegram/Password';
import * as crypto from 'crypto';
import bigInt from 'big-integer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Channel from '../models/Channels';
import {
  TelegramGhostCallerConfig,
  TelegramGhostCallerMessage,
  TelegramGhostCallerMessageResponse,
  TelegramGhostCallerSoundAlert,
  TelegramGhostCallerSoundAlertResponse,
  TelegramGhostCallerCallRequest,
  TelegramGhostCallerCallResponse,
  TelegramGhostCallerSessionResponse,
} from '../types/TelegramGhostCaller';
import * as fs from 'fs';
import * as path from 'path';

interface ActiveClient {
  client: TelegramClient;
  channelId: string;
  connected: boolean;
}

interface PendingAuth {
  client: TelegramClient;
  phoneCodeHash: string;
  phoneNumber: string;
}

export class TelegramGhostCallerService {
  private clients: Map<string, ActiveClient> = new Map();
  private pendingAuths: Map<string, PendingAuth> = new Map();
  private keepAliveIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Gets channel config from database
   */
  private async getChannelConfig(channelId: string): Promise<TelegramGhostCallerConfig> {
    const channel = await Channel.findOne({ channelId });
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const config = channel.config as TelegramGhostCallerConfig;
    if (!config.apiId || !config.apiHash || !config.phoneNumber) {
      throw new Error('Invalid channel configuration: apiId, apiHash, and phoneNumber are required');
    }

    return config;
  }

  /**
   * Updates the string session in the database
   */
  private async updateStringSession(channelId: string, stringSession: string): Promise<void> {
    await Channel.updateOne(
      { channelId },
      { $set: { 'config.stringSession': stringSession } }
    );
  }

  /**
   * Gets or creates a Telegram client for a channel
   * NEVER calls connect() if already connected
   */
  private async getClient(channelId: string): Promise<TelegramClient> {
    const existing = this.clients.get(channelId);

    // Check if client exists and is truly connected
    if (existing) {
      try {
        // Verify connection is still alive
        if (existing.client.connected && existing.connected) {
          return existing.client;
        }
      } catch (error) {
        console.warn(`Client for ${channelId} appears disconnected, removing...`);
        this.clients.delete(channelId);
        this.stopKeepAlive(channelId);
      }
    }

    const config = await this.getChannelConfig(channelId);

    if (!config.stringSession) {
      throw new Error('Client not authorized. Please initiate login first.');
    }

    const stringSession = new StringSession(config.stringSession);
    const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
      connectionRetries: 5,
    });

    // Only connect if not already connected
    if (!client.connected) {
      await client.connect();
    }

    // Check if already authorized
    const isAuthorized = await client.isUserAuthorized();
    if (!isAuthorized) {
      throw new Error('Client not authorized. Please initiate login first.');
    }

    this.clients.set(channelId, {
      client,
      channelId,
      connected: true,
    });

    // Start keepalive ping
    this.startKeepAlive(channelId, client);

    return client;
  }

  /**
   * Starts keepalive ping to prevent session timeout
   */
  private startKeepAlive(channelId: string, client: TelegramClient): void {
    // Clear any existing interval
    this.stopKeepAlive(channelId);

    // Ping every 30 minutes to keep session alive
    const interval = setInterval(async () => {
      try {
        if (client.connected) {
          await client.getMe();
          console.log(`💓 Keepalive ping sent for channel ${channelId}`);
        }
      } catch (error) {
        console.error(`❌ Keepalive ping failed for channel ${channelId}:`, error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    this.keepAliveIntervals.set(channelId, interval);
  }

  /**
   * Stops keepalive ping for a channel
   */
  private stopKeepAlive(channelId: string): void {
    const interval = this.keepAliveIntervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.keepAliveIntervals.delete(channelId);
    }
  }

  /**
   * Generates speech from text using Gemini TTS
   * Returns path to temporary audio file
   */
  private async generateTTS(text: string, voiceName: string = 'Puck'): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }

    try {
      console.log(`🎤 Generating TTS audio with Gemini (voice: ${voiceName})...`);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-tts' });

      // Using type assertion for preview TTS API
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        } as any,
      } as any);

      const audioData = result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) {
        throw new Error('No audio data received from Gemini');
      }

      // Save to temporary file
      const tempDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const audioFilePath = path.join(tempDir, `tts_${Date.now()}.wav`);
      fs.writeFileSync(audioFilePath, Buffer.from(audioData, 'base64'));

      console.log(`✅ TTS audio generated: ${audioFilePath}`);
      return audioFilePath;
    } catch (error: any) {
      console.error(`❌ Error generating TTS:`, error);
      throw error;
    }
  }

  /**
   * Resolves a recipient (username or phone number) to a Telegram entity
   * For phone numbers, imports them as a contact first
   */
  private async resolveEntity(client: TelegramClient, recipient: string): Promise<any> {
    try {
      // If it's a phone number (starts with +), import as contact first
      if (recipient.startsWith('+')) {
        console.log(`📞 Importing phone number as contact: ${recipient}`);

        // Import the contact
        const result = await client.invoke(
          new Api.contacts.ImportContacts({
            contacts: [
              new Api.InputPhoneContact({
                clientId: bigInt(Math.floor(Math.random() * 9999999)),
                phone: recipient,
                firstName: 'Contact',
                lastName: '',
              }),
            ],
          })
        );

        // Get the imported user
        if (result.users && result.users.length > 0) {
          console.log(`✅ Contact imported successfully`);
          return result.users[0];
        }

        // Fallback: try to get entity directly
        console.log(`⚠️ Contact import returned no users, trying direct lookup...`);
        return await client.getEntity(recipient);
      }

      // For usernames, use getEntity directly
      return await client.getEntity(recipient);
    } catch (error: any) {
      console.error(`❌ Error resolving entity for ${recipient}:`, error);
      throw error;
    }
  }

  /**
   * Step 1: Initiates login - sends verification code to phone
   * Returns awaiting_code status if code was sent successfully
   */
  async initiateLogin(channelId: string): Promise<TelegramGhostCallerSessionResponse> {
    try {
      const config = await this.getChannelConfig(channelId);

      // Check if we already have an active client
      const existingClient = this.clients.get(channelId);
      if (existingClient && existingClient.connected) {
        return {
          success: true,
          status: 'connected',
          message: 'Already connected and authenticated',
        };
      }

      // If we have a session string but no active client, try to connect
      if (config.stringSession) {
        const stringSession = new StringSession(config.stringSession);
        const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
          connectionRetries: 5,
        });

        await client.connect();
        const isAuthorized = await client.isUserAuthorized();

        if (isAuthorized) {
          this.clients.set(channelId, { client, channelId, connected: true });
          return {
            success: true,
            status: 'connected',
            message: 'Connected with existing session',
          };
        }
      }

      // Need to start fresh login - send verification code
      const stringSession = new StringSession('');
      const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
      });

      await client.connect();

      console.log(`🔄 Sending verification code to ${config.phoneNumber}...`);

      // Send code and get phoneCodeHash
      const result = await client.sendCode(
        { apiId: config.apiId, apiHash: config.apiHash },
        config.phoneNumber
      );

      // Store the pending auth with phoneCodeHash for step 2
      this.pendingAuths.set(channelId, {
        client,
        phoneCodeHash: result.phoneCodeHash,
        phoneNumber: config.phoneNumber,
      });

      console.log(`✅ Verification code sent to ${config.phoneNumber}`);

      return {
        success: true,
        status: 'awaiting_code',
        message: `Verification code sent to ${config.phoneNumber}. Use /verify endpoint with phoneCode.`,
      };
    } catch (error: any) {
      console.error(`❌ Error initiating login:`, error);
      return {
        success: false,
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Step 2: Completes login with verification code (and optional 2FA password)
   */
  async completeLogin(
    channelId: string,
    phoneCode: string,
    password?: string
  ): Promise<TelegramGhostCallerSessionResponse> {
    try {
      const pending = this.pendingAuths.get(channelId);

      if (!pending) {
        return {
          success: false,
          status: 'error',
          message: 'No pending authentication. Please call /login first to get a verification code.',
        };
      }

      const { client, phoneCodeHash, phoneNumber } = pending;
      const config = await this.getChannelConfig(channelId);

      try {
        // Try to sign in with the code
        console.log(`🔐 Attempting sign in with code for ${phoneNumber}...`);
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phoneNumber,
            phoneCodeHash: phoneCodeHash,
            phoneCode: phoneCode,
          })
        );
      } catch (signInError: any) {
        // Check if 2FA is required
        if (signInError.errorMessage === 'SESSION_PASSWORD_NEEDED') {
          // Get password from request or config
          const pwd = password || config.password2FA;

          if (!pwd) {
            return {
              success: true,
              status: 'awaiting_password',
              message: 'Two-factor authentication required. Please provide password.',
            };
          }

          console.log('🔐 2FA required, signing in with password...');

          // Get password info and sign in with 2FA
          const passwordInfo = await client.invoke(new Api.account.GetPassword());
          await client.invoke(
            new Api.auth.CheckPassword({
              password: await computeCheck(passwordInfo, pwd),
            })
          );
        } else {
          throw signInError;
        }
      }

      // Save the session
      const sessionString = client.session.save() as unknown as string;
      await this.updateStringSession(channelId, sessionString);

      // Store the connected client
      this.clients.set(channelId, { client, channelId, connected: true });
      this.pendingAuths.delete(channelId);

      console.log(`✅ Channel ${channelId} authenticated successfully!`);

      return {
        success: true,
        status: 'connected',
        stringSession: sessionString,
        message: 'Successfully authenticated!',
      };
    } catch (error: any) {
      console.error(`❌ Error completing login:`, error);

      // Don't delete pending auth on PHONE_CODE_INVALID - let user retry
      if (error.errorMessage === 'PHONE_CODE_INVALID') {
        return {
          success: false,
          status: 'error',
          message: 'Invalid verification code. Please check and try again.',
        };
      }

      // For other errors, clean up pending auth
      this.pendingAuths.delete(channelId);
      return {
        success: false,
        status: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Sends an aggressive sound alert (voice note) to bypass silent notifications
   */
  async sendSoundAlert(
    channelId: string,
    alert: TelegramGhostCallerSoundAlert
  ): Promise<TelegramGhostCallerSoundAlertResponse> {
    try {
      const client = await this.getClient(channelId);

      // Get the entity (user) to send alert to
      const entity = await this.resolveEntity(client, alert.recipient);

      // Default sound file path
      const soundFile = alert.soundFile || path.join(process.cwd(), 'alert.ogg');

      // Check if sound file exists
      if (!fs.existsSync(soundFile)) {
        console.error(`❌ Sound file not found: ${soundFile}`);
        return {
          success: false,
          error: `Sound file not found: ${soundFile}`,
        };
      }

      console.log(`🔊 Sending aggressive sound alert to ${alert.recipient}...`);

      // Prepare message with mention if provided
      const message = alert.message
        ? alert.message.includes('@')
          ? alert.message
          : `@${alert.recipient} ${alert.message}`
        : `@${alert.recipient} ⚠️ ALERTA DE SISTEMA`;

      // Send voice note with aggressive attributes
      const result = await client.sendFile(entity, {
        file: soundFile,
        caption: message,
        voiceNote: true, // Key: converts to voice note (PTT)
        attributes: [
          new Api.DocumentAttributeAudio({
            voice: true, // Indicates it's voice
            duration: alert.duration || 2, // Duration in seconds
            waveform: Buffer.from(Array(100).fill(255)) // Visual waveform (noise)
          })
        ],
      });

      console.log(`✅ Aggressive sound alert sent to ${alert.recipient}`);

      return {
        success: true,
        messageId: result.id,
        date: result.date,
      };
    } catch (error: any) {
      console.error(`❌ Error sending sound alert:`, error);

      if (error.errorMessage === 'USER_PRIVACY_RESTRICTED') {
        return {
          success: false,
          error: 'User has restricted messages. They need to allow messages from this account.',
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sends a message to a Telegram user
   */
  async sendMessage(
    channelId: string,
    message: TelegramGhostCallerMessage
  ): Promise<TelegramGhostCallerMessageResponse> {
    try {
      const client = await this.getClient(channelId);

      // Get the entity (user) to send message to
      const entity = await this.resolveEntity(client, message.recipient);

      // Send the message
      const result = await client.sendMessage(entity, { message: message.text });

      return {
        success: true,
        messageId: result.id,
        date: result.date,
      };
    } catch (error: any) {
      console.error(`❌ Error sending message:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Initiates a ghost call (VoIP call with fake crypto that rings but doesn't connect audio)
   * If ttsText is provided, generates and sends TTS audio before initiating the call
   */
  async initiateGhostCall(
    channelId: string,
    callRequest: TelegramGhostCallerCallRequest
  ): Promise<TelegramGhostCallerCallResponse> {
    let ttsAudioPath: string | null = null;
    console.log('📞 Initiating ghost call to', callRequest);
    try {
      const client = await this.getClient(channelId);

      // Get the entity (user) to call
      const entity = await this.resolveEntity(client, callRequest.recipient);

      if (!entity) {
        return {
          success: false,
          status: 'user_not_found',
          message: `User ${callRequest.recipient} not found`,
        };
      }

      // TRICK: Send wake-up message first (helps iOS devices receive the call)
      let wakeUpMessageSent = false;
      if (callRequest.wakeUpMessage) {
        try {
          await client.sendMessage(entity, { message: callRequest.wakeUpMessage });
          wakeUpMessageSent = true;
          // Wait 500ms for the push notification to wake up the device
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (msgError) {
          console.warn('Failed to send wake-up message:', msgError);
        }
      }

      // Generate and send TTS audio if requested
      let ttsAudioSent = false;
      if (callRequest.ttsText) {
        try {
          console.log(`🎤 Generating TTS audio for call...`);
          ttsAudioPath = await this.generateTTS(
            callRequest.ttsText,
            callRequest.ttsVoice || 'Puck'
          );

          // Send TTS audio as voice note
          await client.sendFile(entity, {
            file: ttsAudioPath,
            voiceNote: true,
            attributes: [
              new Api.DocumentAttributeAudio({
                voice: true,
                duration: 0,
                waveform: Buffer.from([]),
              }),
            ],
          });

          ttsAudioSent = true;
          console.log(`✅ TTS audio sent to ${callRequest.recipient}`);

          // Wait 1 second before initiating call
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (ttsError) {
          console.error('Failed to generate/send TTS audio:', ttsError);
        }
      }

      // Generate fake cryptographic hash (256 bytes random -> SHA-256 = 32 bytes)
      const fakeGA = crypto.randomBytes(256);
      const gAHash = crypto.createHash('sha256').update(fakeGA).digest();

      // Phone call protocol
      const protocol = new Api.PhoneCallProtocol({
        minLayer: 93,
        maxLayer: 93,
        udpP2p: true,
        udpReflector: true,
        libraryVersions: ['1.0'],
      });

      // Generate safe 32-bit random ID
      const randomId = Math.floor(Math.random() * 2147483647);

      // Get InputUser for the call
      const inputUser = await client.getInputEntity(entity);

      // Invoke the ghost call
      await client.invoke(
        new Api.phone.RequestCall({
          userId: inputUser,
          randomId: randomId,
          gAHash: gAHash,
          protocol: protocol,
        })
      );

      return {
        success: true,
        status: 'initiated',
        message: ttsAudioSent
          ? 'Ghost call initiated with TTS audio! The recipient\'s phone should be ringing.'
          : 'Ghost call initiated! The recipient\'s phone should be ringing.',
        wakeUpMessageSent,
      };
    } catch (error: any) {
      console.error(`❌ Error initiating ghost call:`, error);

      if (error.errorMessage === 'USER_PRIVACY_RESTRICTED') {
        return {
          success: false,
          status: 'privacy_restricted',
          message: 'User has restricted calls. They need to allow calls from this account.',
        };
      }

      return {
        success: false,
        status: 'error',
        message: error.message,
      };
    } finally {
      // Clean up temporary TTS audio file
      if (ttsAudioPath && fs.existsSync(ttsAudioPath)) {
        try {
          fs.unlinkSync(ttsAudioPath);
          console.log(`🗑️ Cleaned up TTS audio file: ${ttsAudioPath}`);
        } catch (cleanupError) {
          console.warn(`Failed to clean up TTS file: ${cleanupError}`);
        }
      }
    }
  }

  /**
   * Disconnects a specific channel's client
   */
  async disconnectChannel(channelId: string): Promise<void> {
    const activeClient = this.clients.get(channelId);
    if (activeClient) {
      try {
        this.stopKeepAlive(channelId);
        await activeClient.client.disconnect();
      } catch (error) {
        console.error(`Error disconnecting channel ${channelId}:`, error);
      }
      this.clients.delete(channelId);
    }
  }

  /**
   * Disconnects all active clients (for graceful shutdown)
   */
  async disconnectAll(): Promise<void> {
    console.log(`🛑 Disconnecting ${this.clients.size} Telegram Ghost Caller clients...`);

    const disconnectPromises = Array.from(this.clients.keys()).map(channelId =>
      this.disconnectChannel(channelId)
    );

    await Promise.all(disconnectPromises);
    console.log('✅ All Telegram Ghost Caller clients disconnected');
  }

  /**
   * Restores active channels on server startup
   */
  async restoreActiveChannels(): Promise<void> {
    try {
      const channels = await Channel.find({
        type: 'telegram_ghost_caller',
        isActive: true,
        'config.stringSession': { $exists: true, $ne: '' }
      });

      for (const channel of channels) {
        try {
          const config = channel.config as TelegramGhostCallerConfig;

          // Check if client already exists and is connected
          const existingClient = this.clients.get(channel.channelId);
          if (existingClient && existingClient.connected) {
            console.log(`✅ Channel ${channel.name} already connected, skipping restore`);
            continue;
          }

          if (config.stringSession) {
            const stringSession = new StringSession(config.stringSession);
            const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
              connectionRetries: 5,
            });

            // Only connect if not already connected
            if (!client.connected) {
              await client.connect();
            }

            const isAuthorized = await client.isUserAuthorized();

            if (isAuthorized) {
              this.clients.set(channel.channelId, {
                client,
                channelId: channel.channelId,
                connected: true,
              });

              // Start keepalive ping
              this.startKeepAlive(channel.channelId, client);

              console.log(`✅ Restored Telegram Ghost Caller channel: ${channel.name}`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to restore channel ${channel.channelId}:`, error);
        }
      }

      console.log(`✅ Telegram Ghost Caller service ready (${this.clients.size} channels restored)`);
    } catch (error) {
      console.error('❌ Error restoring Telegram Ghost Caller channels:', error);
    }
  }

  /**
   * Gets connection status for a channel
   */
  async getConnectionStatus(channelId: string): Promise<{ connected: boolean; authorized: boolean }> {
    const activeClient = this.clients.get(channelId);
    if (!activeClient) {
      return { connected: false, authorized: false };
    }

    try {
      const authorized = await activeClient.client.isUserAuthorized();
      return { connected: activeClient.connected, authorized };
    } catch {
      return { connected: false, authorized: false };
    }
  }
}

export const telegramGhostCallerService = new TelegramGhostCallerService();
