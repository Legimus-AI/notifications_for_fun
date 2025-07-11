import model from '../models/WhatsAppEvents';
import BaseController from './BaseController';

class WhatsAppEventsController extends BaseController {
  constructor() {
    super(model, []);
  }
}

const controller = new WhatsAppEventsController();

export default controller;
