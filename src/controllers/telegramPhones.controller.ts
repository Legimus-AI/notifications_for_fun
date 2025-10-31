import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../helpers/utils';
import Channel from '../models/Channels';
import { telegramPhonesService } from '../services/TelegramPhonesService';
import { TelegramPhonesMessage } from '../types/TelegramPhones';
import mongoose from 'mongoose';

class TelegramPhonesController {
  /**
   * Creates a new Telegram Phones channel
   */
  public createChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, botToken, callMeBotToken, defaultPhoneCountry } = req.body;

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

      if (!callMeBotToken) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'CALLMEBOT_TOKEN_REQUIRED'),
        );
      }

      const channelId = uuidv4();

      const channel = new Channel({
        channelId,
        ownerApiKeyId: new mongoose.Types.ObjectId(),
        type: 'telegram_phones',
        name,
        config: {
          botToken,
          callMeBotToken,
          defaultPhoneCountry: defaultPhoneCountry || '+1'
        },
        status: 'active',
      });

      await channel.save();

      res.status(201).json({
        ok: true,
        payload: {
          channelId,
          name,
          type: 'telegram_phones',
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a message through Telegram Phones
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

      const message: TelegramPhonesMessage = {
        chat_id,
        text,
        parse_mode,
        disable_web_page_preview,
        disable_notification,
        reply_to_message_id,
        reply_markup,
      };

      const result = await telegramPhonesService.sendMessage(channelId, message);

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
   * Initiates a phone call using CallMeBot
   */
  public initiateCall = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { phone, message, language } = req.body;

      if (!phone) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'PHONE_NUMBER_REQUIRED'),
        );
      }

      const result = await telegramPhonesService.initiatePhoneCall(channelId, {
        phone,
        message,
        language,
      });

      console.log("phone callmebot result: ", result);

      res.status(200).json({
        ok: result.success,
        message: result.success ? 'Phone call initiated successfully' : 'Failed to initiate phone call',
        payload: result,
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a message with a call request button
   */
  public sendCallRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { chat_id, message, phone_number } = req.body;

      if (!chat_id) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'CHAT_ID_REQUIRED'),
        );
      }

      if (!message) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'MESSAGE_REQUIRED'),
        );
      }

      const result = await telegramPhonesService.sendCallRequestMessage(
        channelId,
        chat_id,
        message,
        phone_number,
      );

      res.status(200).json({
        ok: true,
        message: 'Call request message sent successfully',
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
   * Updates a Telegram Phones channel configuration
   */
  public updateChannel = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { name, botToken, callMeBotToken, defaultPhoneCountry } = req.body;

      const channel = await Channel.findOne({ channelId });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      if (channel.type !== 'telegram_phones') {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'INVALID_CHANNEL_TYPE'),
        );
      }

      // Update channel properties
      if (name) channel.name = name;
      const config = channel.config as any;
      if (botToken) config.botToken = botToken;
      if (callMeBotToken) config.callMeBotToken = callMeBotToken;
      if (defaultPhoneCountry) config.defaultPhoneCountry = defaultPhoneCountry;

      await channel.save();

      res.status(200).json({
        ok: true,
        message: 'Telegram Phones channel updated successfully',
        payload: {
          channelId: channel.channelId,
          name: channel.name,
          type: channel.type,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Deletes a Telegram Phones channel
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

      if (channel.type !== 'telegram_phones') {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'INVALID_CHANNEL_TYPE'),
        );
      }

      await Channel.deleteOne({ channelId });

      res.status(200).json({
        ok: true,
        message: 'Telegram Phones channel deleted successfully',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Lists all Telegram Phones channels
   */
  public listChannels = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const channels = await Channel.find({ type: 'telegram_phones' });

      const channelsList = channels.map((channel) => {
        const config = channel.config as any;
        return {
          channelId: channel.channelId,
          name: channel.name,
          createdAt: channel.createdAt,
          config: {
            hasBotToken: !!config.botToken,
            hasCallMeBotToken: !!config.callMeBotToken,
            defaultPhoneCountry: config.defaultPhoneCountry,
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
   * Gets a specific Telegram Phones channel details
   */
  public getChannel = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { channelId } = req.params;

      const channel = await Channel.findOne({ channelId, type: 'telegram_phones' });
      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(404, 'CHANNEL_NOT_FOUND'),
        );
      }

      const config = channel.config as any;
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
            hasBotToken: !!config.botToken,
            hasCallMeBotToken: !!config.callMeBotToken,
            defaultPhoneCountry: config.defaultPhoneCountry,
          },
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };
}

const telegramPhonesController = new TelegramPhonesController();
export default telegramPhonesController;
