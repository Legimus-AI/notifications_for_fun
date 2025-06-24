import model from '../models/Channels';
import BaseController from './BaseController';

class ChannelsController extends BaseController {
  constructor() {
    super(model, []);
  }
}

const controller = new ChannelsController();

export default controller;
