import model from '../models/NotificationLogs';
import BaseController from './BaseController';

class NotificationsController extends BaseController {
  constructor() {
    super(model, []);
  }
}

const controller = new NotificationsController();

export default controller;
