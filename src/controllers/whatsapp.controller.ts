import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../helpers/utils';
import Channel, { WhatsAppAutomatedConfig } from '../models/Channels';
import { whatsAppService } from '../services/WhatsAppService';
import mongoose from 'mongoose';
import { handleError, formatJid } from '../helpers/utils';

class WhatsAppController {
  /**
   * Generates a unique trace ID for error tracking
   */
  private generateTraceId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Creates a new WhatsApp channel
   */
  public createChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, phoneNumber } = req.body;
      const channelId = uuidv4();

      // Create channel in database
      const channel = new Channel({
        channelId,
        ownerApiKeyId: new mongoose.Types.ObjectId(), // Temporary placeholder
        type: 'whatsapp_automated',
        name,
        config: {
          phoneNumber,
        },
        status: 'inactive',
      });

      await channel.save();

      res.status(201).json({
        ok: true,
        payload: {
          channelId,
          name,
          type: 'whatsapp_automated',
          status: 'inactive',
          phoneNumber,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Connects a WhatsApp channel (starts the Baileys connection)
   */
  public connectChannel = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { phoneNumber } = req.body; // Optional for pairing code

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
        return;
      }

      // Force socket reset: close existing connection without clearing auth state
      const currentStatus = whatsAppService.getChannelStatus(channelId);
      if (currentStatus === 'active' || currentStatus === 'connecting') {
        console.log(`🔄 Force resetting socket for channel ${channelId} (current status: ${currentStatus}) - preserving auth state`);
        try {
          // Reset socket connection without logout (preserves auth state, no QR needed)
          await whatsAppService.resetSocketConnection(channelId);
          // Give a moment for cleanup
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (resetError) {
          console.warn(`⚠️ Error during socket reset for ${channelId}:`, resetError);
          // Continue with connection attempt even if reset fails
        }
      }

      // Start fresh connection
      console.log(`🚀 Starting fresh connection for channel ${channelId}`);
      await whatsAppService.connectChannel(channelId, phoneNumber);

      res.status(200).json({
        ok: true,
        message: 'Socket reset and fresh connection initiated (auth state preserved, no QR needed)',
        channelId,
        status: 'connecting',
        socketReset: true,
        authPreserved: true,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Disconnects a WhatsApp channel
   */
  public disconnectChannel = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Disconnect
      await whatsAppService.disconnectChannel(channelId);

      res.status(200).json({
        ok: true,
        message: 'Channel disconnected',
        channelId,
        status: 'inactive',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Gets channel status
   */
  public getChannelStatus = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Get status from memory first, fallback to database
      let status = whatsAppService.getChannelStatus(channelId);
      if (status === 'inactive' && channel.status !== 'inactive') {
        // Use database status if memory shows inactive but DB shows different status
        status = channel.status;
      }

      res.status(200).json({
        ok: true,
        payload: {
          channelId,
          name: channel.name,
          status,
          lastStatusUpdate: channel.lastStatusUpdate,
          isActive: channel.isActive,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a text message through WhatsApp
   */
  public sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { to, message, type = 'text' } = req.body;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Check if channel is active
      const status = whatsAppService.getChannelStatus(channelId);
      if (status !== 'active') {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'CHANNEL_NOT_ACTIVE'),
        );
      }

      let result;
      if (type === 'text') {
        result = await whatsAppService.sendTextMessage(channelId, to, message);
      } else {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'UNSUPPORTED_MESSAGE_TYPE'),
        );
      }

      res.status(200).json({
        ok: true,
        message: 'Message sent',
        payload: {
          messageId: result.key.id,
          to,
          type,
          status: 'sent',
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a media message through WhatsApp
   */
  public sendMediaMessage = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { to, mediaType, mediaUrl, caption } = req.body;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Check if channel is active
      const status = whatsAppService.getChannelStatus(channelId);
      if (status !== 'active') {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'CHANNEL_NOT_ACTIVE'),
        );
      }

      // For now, we'll accept a media URL and fetch it
      // In production, you might want to handle file uploads differently
      const result = await whatsAppService.sendMediaMessage(
        channelId,
        to,
        mediaType,
        mediaUrl, // This should be a Buffer or URL
        caption,
      );

      res.status(200).json({
        ok: true,
        message: 'Media message sent',
        payload: {
          messageId: result.key.id,
          to,
          mediaType,
          status: 'sent',
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Lists all WhatsApp channels
   */
  public listChannels = async (req: Request, res: Response): Promise<void> => {
    try {
      const channels = await Channel.find({
        type: 'whatsapp_automated',
      });

      const channelsWithStatus = channels.map((channel) => {
        // Get status from memory first, fallback to database
        let status = whatsAppService.getChannelStatus(channel.channelId);
        if (status === 'inactive' && channel.status !== 'inactive') {
          // Use database status if memory shows inactive but DB shows different status
          status = channel.status;
        }

        return {
          channelId: channel.channelId,
          name: channel.name,
          status,
          lastStatusUpdate: channel.lastStatusUpdate,
          isActive: channel.isActive,
          phoneNumber: (channel.config as WhatsAppAutomatedConfig)?.phoneNumber,
          createdAt: channel.createdAt,
          webhooks: channel.webhooks,
        };
      });

      res.status(200).json({
        ok: true,
        payload: channelsWithStatus,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Gets QR code for a channel (if available)
   */
  public getQRCode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Check if QR is available in config
      const qrCode = (channel.config as WhatsAppAutomatedConfig)?.qrCode;
      if (!qrCode) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'QR_CODE_NOT_AVAILABLE'),
        );
      }

      res.status(200).json({
        ok: true,
        payload: {
          channelId,
          qrCode,
          status: channel.status,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Requests a pairing code for a channel
   */
  public requestPairingCode = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'PHONE_NUMBER_REQUIRED'),
        );
      }

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Connect with pairing code
      await whatsAppService.connectChannel(channelId, phoneNumber);

      res.status(200).json({
        ok: true,
        message: 'Pairing code requested',
        channelId,
        status: 'connecting',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Refreshes QR code for an existing channel (when logged out or QR expired)
   */
  public refreshQR = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Check current status
      const currentStatus = whatsAppService.getChannelStatus(channelId);
      console.log(`🔄 Refreshing QR for channel ${channelId}, current status: ${currentStatus}`);

      // Refresh QR code
      await whatsAppService.refreshQRCode(channelId);

      res.status(200).json({
        ok: true,
        message: 'QR code refresh initiated',
        channelId,
        status: 'generating_qr',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Deletes a WhatsApp channel completely
   */
  public deleteChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel first
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Check if channel is currently connected and disconnect if needed
      const currentStatus = whatsAppService.getChannelStatus(channelId);
      if (currentStatus === 'active' || currentStatus === 'connecting') {
        console.log(`🔌 Disconnecting channel ${channelId} before deletion...`);
        await whatsAppService.disconnectChannel(channelId);
      }

      // Clear auth state and credentials
      console.log(`🧹 Clearing auth state for channel ${channelId}...`);
      await whatsAppService.clearAuthState(channelId);

      // Remove from WhatsApp service memory
      console.log(`🗑️ Removing channel ${channelId} from service memory...`);
      await whatsAppService.removeChannel(channelId);

      // Delete channel from database
      console.log(`🗄️ Deleting channel ${channelId} from database...`);
      await Channel.deleteOne({ channelId });

      console.log(
        `✅ Channel ${channelId} (${channel.name}) deleted successfully`,
      );

      res.status(200).json({
        ok: true,
        message: 'Channel deleted successfully',
        payload: {
          channelId,
          name: channel.name,
          deletedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error(`❌ Error deleting channel:`, error);
      utils.handleError(res, error);
    }
  };

  /**
   * Clears auth state for a channel (for debugging)
   */
  public clearAuthState = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Clear auth state
      await whatsAppService.clearAuthState(channelId);

      res.status(200).json({
        ok: true,
        message: 'Auth state cleared',
        channelId,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a message through a specific channel.
   * The payload should be similar to the WhatsApp Cloud API.
   */
  public sendMessageFromApi = async (req: Request, res: Response) => {
    try {
      const { channelId } = req.params;
      const payload = req.body;

      // Validate required fields
      if (!payload.to) {
        return res.status(400).json({
          error: {
            message: 'Parameter "to" is required',
            type: 'OAuthException',
            code: 131021,
            error_subcode: 2490003,
            fbtrace_id: this.generateTraceId(),
          },
        });
      }

      if (!payload.type) {
        return res.status(400).json({
          error: {
            message: 'Parameter "type" is required',
            type: 'OAuthException',
            code: 131021,
            error_subcode: 2490003,
            fbtrace_id: this.generateTraceId(),
          },
        });
      }

      const result = await whatsAppService.sendMessageFromApi(
        channelId,
        payload,
      );

      // Format response to match WhatsApp Cloud API
      const wa_id = result.key.remoteJid.split('@')[0];
      const formattedResponse = {
        messaging_product: 'whatsapp',
        contacts: [
          {
            input: payload.to, // Assuming 'to' is in the payload
            wa_id: wa_id,
          },
        ],
        messages: [
          {
            id: result.key.id,
          },
        ],
      };

      res.status(200).json(formattedResponse);
    } catch (error) {
                  console.error('Error sending message via API:', error);

      // Handle specific validation errors with WhatsApp Cloud API format
      if (error.message.includes('not registered on WhatsApp')) {
        return res.status(400).json({
          error: {
            message: error.message,
            type: 'OAuthException',
            code: 131026,
            error_subcode: 2490011,
            fbtrace_id: this.generateTraceId(),
          },
        });
      }

      if (error.message.includes('Failed to validate phone number')) {
        return res.status(400).json({
          error: {
            message: error.message,
            type: 'OAuthException',
            code: 131021,
            error_subcode: 2490003,
            fbtrace_id: this.generateTraceId(),
          },
        });
      }

      if (error.message.includes('is not connected')) {
        return res.status(400).json({
          error: {
            message: error.message,
            type: 'OAuthException',
            code: 131005,
            error_subcode: 2490004,
            fbtrace_id: this.generateTraceId(),
          },
        });
      }

      if (error.message.includes('Unsupported message type')) {
        return res.status(400).json({
          error: {
            message: error.message,
            type: 'OAuthException',
            code: 131009,
            error_subcode: 2490005,
            fbtrace_id: this.generateTraceId(),
          },
        });
      }

      // Default error handling for other errors
      handleError(res, error);
    }
  };

  /**
   * Checks if a WhatsApp ID (JID) exists.
   */
  public checkContact = async (req: Request, res: Response) => {
    try {
      const { channelId } = req.params;
      let { jid } = req.params;
      jid = formatJid(jid);

      let finalJid = jid;
      // If this is a LID, try to resolve it to a phone number
      if (jid.includes('@lid')) {
        try {
          const lidResult = await whatsAppService.getPhoneNumberByLid(channelId, jid);
          if (lidResult && lidResult.pn) {
            finalJid = lidResult.pn;
            console.log(`✅ LID resolved for check: ${jid} -> ${finalJid}`);
          }
        } catch (lidError) {
          console.warn(`⚠️ Error resolving LID ${jid}:`, lidError);
        }
      }

      const result = await whatsAppService.checkIdExists(channelId, finalJid);
      res.status(200).json({
        ok: true,
        payload: result,
      });
    } catch (error) {
      handleError(res, error);
    }
  };

  /**
   * Fetches the status of a WhatsApp contact.
   */
  public getContactStatus = async (req: Request, res: Response) => {
    try {
      const { channelId } = req.params;
      let { jid } = req.params;
      jid = formatJid(jid);

      let finalJid = jid;
      // If this is a LID, try to resolve it to a phone number
      if (jid.includes('@lid')) {
        try {
          const lidResult = await whatsAppService.getPhoneNumberByLid(channelId, jid);
          if (lidResult && lidResult.pn) {
            finalJid = lidResult.pn;
            console.log(`✅ LID resolved for status: ${jid} -> ${finalJid}`);
          }
        } catch (lidError) {
          console.warn(`⚠️ Error resolving LID ${jid}:`, lidError);
        }
      }

      const result = await whatsAppService.fetchContactStatus(channelId, finalJid);
      if (result) {
        res.status(200).json({
          ok: true,
          payload: result,
        });
      } else {
        handleError(res, {
          code: 404,
          message: 'Status not found or private.',
        });
      }
    } catch (error) {
      handleError(res, error);
    }
  };

  /**
   * Fetches the profile picture of a WhatsApp contact.
   */
  public getProfilePicture = async (req: Request, res: Response) => {
    try {
      const { channelId } = req.params;
      let { jid } = req.params;
      console.log('Original jid:', jid);
      jid = formatJid(jid);
      console.log('Formatted jid:', jid);
      const { type } = req.query; // 'preview' or 'image'

      let finalJid = jid;
      let isLid = false;

      // If this is a LID, try to resolve it to a phone number
      if (jid.includes('@lid')) {
        isLid = true;
        console.log('Detected LID, attempting to resolve to phone number...');
        try {
          const lidResult = await whatsAppService.getPhoneNumberByLid(channelId, jid);
          if (lidResult && lidResult.pn) {
            finalJid = lidResult.pn;
            console.log(`✅ LID resolved: ${jid} -> ${finalJid}`);
          } else {
            console.log(`⚠️ LID not found in mapping, will try with LID directly: ${jid}`);
          }
        } catch (lidError) {
          console.warn(`⚠️ Error resolving LID ${jid}:`, lidError);
          console.log('Will attempt to fetch profile picture using LID directly...');
        }
      }

      // Download and save the profile picture locally
      const localUrl = await whatsAppService.downloadAndSaveProfilePicture(
        channelId,
        finalJid,
        type === 'image' ? 'image' : 'preview',
      );

      if (localUrl) {
        res.status(200).json({
          ok: true,
          payload: {
            url: localUrl,
            type: type === 'image' ? 'image' : 'preview',
            jid: finalJid,
            originalJid: isLid ? jid : undefined,
            wasLid: isLid,
          },
        });
      } else {
        handleError(res, {
          code: 404,
          message: 'Profile picture not found or private.',
        });
      }
    } catch (error) {
      handleError(res, error);
    }
  };

  /**
   * Adds or updates a webhook for a WhatsApp channel
   */
  public addWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { url, events } = req.body;

      // Validate required fields
      if (!url) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'WEBHOOK_URL_REQUIRED'),
        );
      }

      if (!events || !Array.isArray(events) || events.length === 0) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'WEBHOOK_EVENTS_REQUIRED'),
        );
      }

      // Validate events
      const validEvents = [
        'message.received',
        'message.sent',
        'message.delivered',
        'message.read',
        'message.status',
        'call.received',
      ];
      const invalidEvents = events.filter(
        (event) => !validEvents.includes(event),
      );
      if (invalidEvents.length > 0) {
        return utils.handleError(
          res,
          utils.buildErrObject(
            400,
            `INVALID_EVENTS: ${invalidEvents.join(', ')}`,
          ),
        );
      }

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Check if webhook with this URL already exists
      const existingWebhookIndex = channel.webhooks.findIndex(
        (webhook) => webhook.url === url,
      );

      if (existingWebhookIndex !== -1) {
        // Update existing webhook using updateOne to avoid validation issues
        await Channel.updateOne(
          { channelId, 'webhooks.url': url },
          {
            $set: {
              'webhooks.$.events': events,
              'webhooks.$.isActive': true,
            },
          },
        );
      } else {
        // Add new webhook using updateOne
        await Channel.updateOne(
          { channelId },
          {
            $push: {
              webhooks: {
                url,
                events,
                isActive: true,
              },
            },
          },
        );
      }

      console.log(
        `📋 Webhook ${
          existingWebhookIndex !== -1 ? 'updated' : 'added'
        } for channel ${channelId}: ${url}`,
      );

      res.status(200).json({
        ok: true,
        message:
          existingWebhookIndex !== -1 ? 'Webhook updated' : 'Webhook added',
        payload: {
          channelId,
          webhook: {
            url,
            events,
            isActive: true,
          },
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Lists all webhooks for a WhatsApp channel
   */
  public listWebhooks = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      res.status(200).json({
        ok: true,
        payload: {
          channelId,
          webhooks: channel.webhooks,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Updates a specific webhook for a WhatsApp channel
   */
  public updateWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId, webhookId } = req.params;
      const { url, events, isActive } = req.body;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Find webhook
      const webhook = channel.webhooks.find(
        (w) => w._id?.toString() === webhookId,
      );
      if (!webhook) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'WEBHOOK_NOT_FOUND'),
        );
      }

      // Prepare update object
      const updateFields: any = {};
      if (url !== undefined) updateFields['webhooks.$.url'] = url;
      if (events !== undefined) {
        // Validate events
        const validEvents = [
          'message.received',
          'message.sent',
          'message.delivered',
          'message.read',
          'message.status',
          'call.received',
        ];
        const invalidEvents = events.filter(
          (event: string) => !validEvents.includes(event),
        );
        if (invalidEvents.length > 0) {
          return utils.handleError(
            res,
            utils.buildErrObject(
              400,
              `INVALID_EVENTS: ${invalidEvents.join(', ')}`,
            ),
          );
        }
        updateFields['webhooks.$.events'] = events;
      }
      if (isActive !== undefined)
        updateFields['webhooks.$.isActive'] = isActive;

      // Update webhook using updateOne to avoid validation issues
      await Channel.updateOne(
        { channelId, 'webhooks._id': webhookId },
        { $set: updateFields },
      );

      console.log(
        `📋 Webhook updated for channel ${channelId}: ${webhook.url}`,
      );

      res.status(200).json({
        ok: true,
        message: 'Webhook updated',
        payload: {
          channelId,
          webhook: {
            id: webhook._id,
            url: webhook.url,
            events: webhook.events,
            isActive: webhook.isActive,
          },
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Deletes a webhook from a WhatsApp channel
   */
  public deleteWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId, webhookId } = req.params;

      // Find channel
      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      // Find and remove webhook
      const webhookIndex = channel.webhooks.findIndex(
        (w) => w._id?.toString() === webhookId,
      );
      if (webhookIndex === -1) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'WEBHOOK_NOT_FOUND'),
        );
      }

      const webhookUrl = channel.webhooks[webhookIndex].url;

      // Remove webhook using updateOne to avoid validation issues
      await Channel.updateOne(
        { channelId },
        { $pull: { webhooks: { _id: webhookId } } },
      );

      console.log(
        `🗑️ Webhook deleted from channel ${channelId}: ${webhookUrl}`,
      );

      res.status(200).json({
        ok: true,
        message: 'Webhook deleted',
        payload: {
          channelId,
          deletedWebhookId: webhookId,
          deletedWebhookUrl: webhookUrl,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Get all known LID mappings for a channel
   */
  public getAllLids = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const lids = await whatsAppService.getAllLids(channelId, limit, offset);

      res.status(200).json(lids);
    } catch (error) {
      console.error('Error getting LIDs:', error);
      utils.handleError(res, utils.buildErrObject(500, error.message));
    }
  };

  /**
   * Get count of known LID mappings for a channel
   */
  public getLidsCount = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      const count = await whatsAppService.getLidsCount(channelId);

      res.status(200).json({ count });
    } catch (error) {
      console.error('Error getting LIDs count:', error);
      utils.handleError(res, utils.buildErrObject(500, error.message));
    }
  };

  /**
   * Get phone number by LID
   */
  public getPhoneNumberByLid = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId, lid } = req.params;

      const result = await whatsAppService.getPhoneNumberByLid(channelId, lid);

      if (!result) {
        res.status(404).json({
          error: 'LID_NOT_FOUND',
          message: `No phone number found for LID: ${lid}`,
        });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error getting phone number by LID:', error);
      utils.handleError(res, utils.buildErrObject(500, error.message));
    }
  };

  /**
   * Get LID by phone number
   */
  public getLidByPhoneNumber = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId, phoneNumber } = req.params;

      const result = await whatsAppService.getLidByPhoneNumber(
        channelId,
        phoneNumber,
      );

      if (!result) {
        res.status(404).json({
          error: 'PHONE_NUMBER_NOT_FOUND',
          message: `No LID found for phone number: ${phoneNumber}`,
        });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error getting LID by phone number:', error);
      utils.handleError(res, utils.buildErrObject(500, error.message));
    }
  };
}

const whatsAppController = new WhatsAppController();
export default whatsAppController;
