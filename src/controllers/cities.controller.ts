import model from '../models/Cities';
import BaseController from './BaseController';

class CitiesController extends BaseController {
  constructor() {
    super(model, ['name']);
  }
}

const controller = new CitiesController();

export default controller;
