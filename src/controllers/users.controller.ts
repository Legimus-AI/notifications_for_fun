import { v4 as uuidv4 } from 'uuid';
import model from '../models/Users';
import * as utils from '../helpers/utils';
import * as db from '../helpers/db';
import * as emailer from '../helpers/emailer';
import { Request, Response } from 'express';

import BaseController from './BaseController';

/** *******************
 * Private functions *
 ******************** */

/**
 * Creates a new item in database
 * @param {Object} req - request object
 */
const createItem = async (body: any): Promise<any> => {
  try {
    const user = new model(body);
    user.verification = uuidv4();
    const savedUser = await user.save();

    const removeProperties = (userObj: any) => {
      const sanitizedUser = { ...userObj };
      delete sanitizedUser.password;
      delete sanitizedUser.blockExpires;
      delete sanitizedUser.loginAttempts;
      return sanitizedUser;
    };

    return removeProperties(savedUser.toObject());
  } catch (err) {
    throw utils.buildErrObject(422, err.message);
  }
};
class UsersController extends BaseController {
  constructor() {
    super(model, ['email']);
  }

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const { body } = req;
      const doesEmailExists = await emailer.emailExists(body.email);
      if (!doesEmailExists) {
        const item = await createItem(body);
        emailer.sendRegistrationEmailMessage(item);
        res.status(201).json(item);
      }
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { body } = req;
      const id = await utils.isIDGood(req.params.id);
      const doesEmailExists = await emailer.emailExistsExcludingMyself(
        id,
        body.email,
      );
      if (!doesEmailExists) {
        res.status(200).json(await db.updateItem(id, model, body));
      }
    } catch (error) {
      utils.handleError(res, error);
    }
  };
}

const controller = new UsersController();

export default controller;
