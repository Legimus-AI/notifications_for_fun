import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as utils from '../helpers/utils';
import Channel from '../models/Channels';
import { slackService } from '../services/SlackService';
import mongoose from 'mongoose';

class SlackController {
  /**
   * Creates a new Slack channel
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
        type: 'slack',
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
          type: 'slack',
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Sends a message through Slack
   */
  public sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { channelId } = req.params;
      const { channel, text, blocks } = req.body;

      if (!channel) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'SLACK_CHANNEL_REQUIRED'),
        );
      }

      if (!text && !blocks) {
        return utils.handleError(
          res,
          utils.buildErrObject(400, 'TEXT_OR_BLOCKS_REQUIRED'),
        );
      }

      const result = await slackService.sendMessage(channelId, {
        channel,
        text,
        blocks,
      });

      res.status(200).json({
        ok: true,
        message: 'Message sent successfully',
        payload: {
          channel: result.channel,
          ts: result.ts,
        },
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Deletes a Slack channel
   */
  public deleteChannel = async (req: Request, res: Response): Promise<void> => {
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
        message: 'Slack channel deleted successfully',
      });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  /**
   * Lists all Slack channels
   */
  public listChannels = async (req: Request, res: Response): Promise<void> => {
    try {
      const channels = await Channel.find({ type: 'slack' });

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

const slackController = new SlackController();
export default slackController;
