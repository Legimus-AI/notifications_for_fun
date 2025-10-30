import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../helpers/utils';
import Channel from '../models/Channels';
import { telegramService } from '../services/TelegramService';
import mongoose from 'mongoose';
import { TelegramMessage } from '../types/Telegram';

class TelegramController {
  /**
   * Creates a new Telegram channel
   */
  public createChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, botToken } = req.body;

      if (!name) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'NAME_REQUIRED'),
        );
      }

      if (!botToken) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'BOT_TOKEN_REQUIRED'),
        );
      }

      const channelId = uuidv4();

      const channel = new Channel({
        channelId,
        ownerApiKeyId: new mongoose.Types.ObjectId(),
        type: 'telegram',
        name,
        config: { botToken },
        status: 'active',
      });

      await channel.save();

      res.status(201).json({
        ok: true,
        payload: {
          channelId,
          name,
          type: 'telegram',
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a message through Telegram
   */
  public sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const {
        chat_id,
        text,
        parse_mode,
        disable_web_page_preview,
        disable_notification,
        reply_to_message_id,
        reply_markup,
      } = req.body;

      if (!chat_id) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'CHAT_ID_REQUIRED'),
        );
      }

      if (!text) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'TEXT_REQUIRED'),
        );
      }

      const message: TelegramMessage = {
        chat_id,
        text,
        parse_mode,
        disable_web_page_preview,
        disable_notification,
        reply_to_message_id,
        reply_markup,
      };

      const result = await telegramService.sendMessage(channelId, message);

      res.status(200).json({
        ok: true,
        message: 'Message sent successfully',
        payload: {
          message_id: result.result.message_id,
          chat_id: result.result.chat.id,
          date: result.result.date,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Deletes a Telegram channel
   */
  public deleteChannel = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      await Channel.deleteOne({ channelId });

      res.status(200).json({
        ok: true,
        message: 'Telegram channel deleted successfully',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Lists all Telegram channels
   */
  public listChannels = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const channels = await Channel.find({ type: 'telegram' });

      const channelsList = channels.map((channel) => ({
        channelId: channel.channelId,
        name: channel.name,
        createdAt: channel.createdAt,
      }));

      res.status(200).json({
        ok: true,
        payload: channelsList,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };
}

const telegramController = new TelegramController();
export default telegramController;

