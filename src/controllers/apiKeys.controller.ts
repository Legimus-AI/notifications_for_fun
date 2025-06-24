import model from '../models/ApiKeys';
import BaseController from './BaseController';

class ApiKeysController extends BaseController {
  constructor() {
    super(model, []);
  }
}

const controller = new ApiKeysController();

export default controller;
