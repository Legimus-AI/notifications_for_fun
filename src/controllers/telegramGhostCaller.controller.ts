import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../helpers/utils';
import Channel from '../models/Channels';
import { telegramGhostCallerService } from '../services/TelegramGhostCallerService';
import mongoose from 'mongoose';

class TelegramGhostCallerController {
  /**
   * Creates a new Telegram Ghost Caller channel
   */
  public createChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, apiId, apiHash, phoneNumber, password2FA } = req.body;

      if (!name) {
        return utils.handleError(res, utils.buildErrObject(400, 'NAME_REQUIRED'));
      }

      if (!apiId) {
        return utils.handleError(res, utils.buildErrObject(400, 'API_ID_REQUIRED'));
      }

      if (!apiHash) {
        return utils.handleError(res, utils.buildErrObject(400, 'API_HASH_REQUIRED'));
      }

      if (!phoneNumber) {
        return utils.handleError(res, utils.buildErrObject(400, 'PHONE_NUMBER_REQUIRED'));
      }

      const channelId = uuidv4();

      const channel = new Channel({
        channelId,
        ownerApiKeyId: new mongoose.Types.ObjectId(),
        type: 'telegram_ghost_caller',
        name,
        config: {
          apiId: parseInt(apiId, 10),
          apiHash,
          phoneNumber,
          stringSession: '',
          password2FA: password2FA || undefined,
        },
        status: 'pending_auth',
        isActive: false,
      });

      await channel.save();

      res.status(201).json({
        ok: true,
        payload: {
          channelId,
          name,
          type: 'telegram_ghost_caller',
          status: 'pending_auth',
          message: 'Channel created. Please initiate login to authenticate.',
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Initiates login process for a channel
   */
  public initiateLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({ channelId, type: 'telegram_ghost_caller' });
      if (!channel) {
        return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
      }

      const result = await telegramGhostCallerService.initiateLogin(channelId);

      if (result.status === 'connected') {
        channel.status = 'active';
        channel.isActive = true;
        await channel.save();
      }

      res.status(200).json({
        ok: result.success,
        payload: result,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Completes login with verification code
   */
  public completeLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { phoneCode, password } = req.body;

      if (!phoneCode) {
        return utils.handleError(res, utils.buildErrObject(400, 'PHONE_CODE_REQUIRED'));
      }

      const channel = await Channel.findOne({ channelId, type: 'telegram_ghost_caller' });
      if (!channel) {
        return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
      }

      const result = await telegramGhostCallerService.completeLogin(channelId, phoneCode, password);

      if (result.status === 'connected') {
        channel.status = 'active';
        channel.isActive = true;
        await channel.save();
      }

      res.status(200).json({
        ok: result.success,
        payload: result,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a message through Telegram Ghost Caller
   */
  public sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { recipient, text } = req.body;

      if (!recipient) {
        return utils.handleError(res, utils.buildErrObject(400, 'RECIPIENT_REQUIRED'));
      }

      if (!text) {
        return utils.handleError(res, utils.buildErrObject(400, 'TEXT_REQUIRED'));
      }

      const result = await telegramGhostCallerService.sendMessage(channelId, {
        recipient,
        text,
      });

      if (!result.success) {
        return utils.handleError(res, utils.buildErrObject(500, result.error || 'Failed to send message'));
      }

      res.status(200).json({
        ok: true,
        message: 'Message sent successfully',
        payload: {
          messageId: result.messageId,
          date: result.date,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Initiates a ghost call (VoIP call that rings but doesn't connect audio)
   */
  public initiateCall = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { recipient, wakeUpMessage } = req.body;

      if (!recipient) {
        return utils.handleError(res, utils.buildErrObject(400, 'RECIPIENT_REQUIRED'));
      }

      const result = await telegramGhostCallerService.initiateGhostCall(channelId, {
        recipient,
        wakeUpMessage,
      });

      res.status(200).json({
        ok: result.success,
        message: result.message,
        payload: {
          status: result.status,
          wakeUpMessageSent: result.wakeUpMessageSent,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Gets connection status for a channel
   */
  public getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({ channelId, type: 'telegram_ghost_caller' });
      if (!channel) {
        return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
      }

      const connectionStatus = await telegramGhostCallerService.getConnectionStatus(channelId);

      res.status(200).json({
        ok: true,
        payload: {
          channelId,
          name: channel.name,
          status: channel.status,
          isActive: channel.isActive,
          connection: connectionStatus,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Updates a Telegram Ghost Caller channel configuration
   */
  public updateChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { name, apiId, apiHash, phoneNumber, password2FA } = req.body;

      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
      }

      if (channel.type !== 'telegram_ghost_caller') {
        return utils.handleError(res, utils.buildErrObject(400, 'INVALID_CHANNEL_TYPE'));
      }

      if (name) channel.name = name;
      const config = channel.config as any;
      if (apiId) config.apiId = parseInt(apiId, 10);
      if (apiHash) config.apiHash = apiHash;
      if (password2FA !== undefined) config.password2FA = password2FA || undefined;
      if (phoneNumber) {
        config.phoneNumber = phoneNumber;
        config.stringSession = '';
        channel.status = 'pending_auth';
        channel.isActive = false;
        await telegramGhostCallerService.disconnectChannel(channelId);
      }

      await channel.save();

      res.status(200).json({
        ok: true,
        message: 'Channel updated successfully',
        payload: {
          channelId: channel.channelId,
          name: channel.name,
          type: channel.type,
          status: channel.status,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Deletes a Telegram Ghost Caller channel
   */
  public deleteChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
      }

      if (channel.type !== 'telegram_ghost_caller') {
        return utils.handleError(res, utils.buildErrObject(400, 'INVALID_CHANNEL_TYPE'));
      }

      await telegramGhostCallerService.disconnectChannel(channelId);
      await Channel.deleteOne({ channelId });

      res.status(200).json({
        ok: true,
        message: 'Telegram Ghost Caller channel deleted successfully',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Lists all Telegram Ghost Caller channels
   */
  public listChannels = async (req: Request, res: Response): Promise<void> => {
    try {
      const channels = await Channel.find({ type: 'telegram_ghost_caller' });

      const channelsList = channels.map((channel) => {
        const config = channel.config as any;
        return {
          channelId: channel.channelId,
          name: channel.name,
          status: channel.status,
          isActive: channel.isActive,
          createdAt: channel.createdAt,
          config: {
            phoneNumber: config.phoneNumber,
            hasSession: !!config.stringSession,
          },
        };
      });

      res.status(200).json({
        ok: true,
        payload: channelsList,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Gets a specific Telegram Ghost Caller channel details
   */
  public getChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({ channelId, type: 'telegram_ghost_caller' });
      if (!channel) {
        return utils.handleError(res, utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'));
      }

      const config = channel.config as any;
      const connectionStatus = await telegramGhostCallerService.getConnectionStatus(channelId);

      res.status(200).json({
        ok: true,
        payload: {
          channelId: channel.channelId,
          name: channel.name,
          type: channel.type,
          status: channel.status,
          isActive: channel.isActive,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt,
          config: {
            phoneNumber: config.phoneNumber,
            hasSession: !!config.stringSession,
          },
          connection: connectionStatus,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };
}

export default new TelegramGhostCallerController();
