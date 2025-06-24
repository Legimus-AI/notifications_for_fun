import model from '../models/Webhooks';
import BaseController from './BaseController';

class WebhooksController extends BaseController {
  constructor() {
    super(model, []);
  }
}

const controller = new WebhooksController();

export default controller;
