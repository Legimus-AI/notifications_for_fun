import { Request, Response } from 'express';
import * as utils from '../helpers/utils';
import * as db from '../helpers/db';
import BaseValidation from './BaseValidation';

class BaseController {
  model: any;
  uniqueFields: string[];
  validation: BaseValidation = new BaseValidation();

  constructor(model: any, uniqueFields: string[] = []) {
    this.model = model;
    this.uniqueFields = uniqueFields;
  }

  protected itemExistsExcludingItself(id: string, body: any): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      // <-- Add return here
      const query: any = this.uniqueFields.length > 0 ? {} : { noFields: true };
      for (const uniquefield of this.uniqueFields) {
        query[uniquefield] = body[uniquefield];
      }
      query._id = {
        $ne: id,
      };
      try {
        const item = await this.model.findOne(query);
        utils.itemAlreadyExists(null, item, reject, 'Este registro no existe');
        resolve(false);
      } catch (error) {
        utils.itemAlreadyExists(error, null, reject, 'Este registro no existe');
      }
    });
  }

  protected itemExists(body: any): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      const query = this.uniqueFields.length > 0 ? {} : { noFields: true };
      for (const uniquefield of this.uniqueFields) {
        query[uniquefield] = body[uniquefield];
      }
      try {
        const item = await this.model.findOne(query);
        utils.itemAlreadyExists(null, item, reject, 'Este registro ya existe');
        resolve(false);
      } catch (error) {
        utils.itemAlreadyExists(error, null, reject, 'Este registro ya existe');
      }
    });
  }

  public handleError = (res: Response, error: any): void => {
    utils.handleError(res, error);
  };

  // CRUD
  public listAll = async (req: Request, res: Response): Promise<void> => {
    try {
      res
        .status(200)
        .json({ ok: true, payload: await db.getAllItems(this.model) });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  public list = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = await db.checkQueryString(req.query);
      res
        .status(200)
        .json({ ok: true, ...(await db.getItems(req, this.model, query)) });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  public listOne = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = await utils.isIDGood(req.params.id);
      res
        .status(200)
        .json({ ok: true, payload: await db.getItem(id, this.model) });
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    try {
      req.body.userId = (req as any).user?._id;
      const doesItemExists = await this.itemExists(req.body);
      if (!doesItemExists) {
        res.status(200).json({
          ok: true,
          payload: await db.createItem(req.body, this.model),
        });
      }
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    try {
      req.body.userId = (req as any).user?._id;
      const id = await utils.isIDGood(req.params.id);
      const doesItemExists = await this.itemExistsExcludingItself(id, req.body);
      if (!doesItemExists) {
        res.status(200).json({
          ok: true,
          payload: await db.updateItem(id, this.model, req.body),
        });
      }
    } catch (error) {
      utils.handleError(res, error);
    }
  };

  public delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = await utils.isIDGood(req.params.id);
      res
        .status(200)
        .json({ ok: true, payload: await db.deleteItem(id, this.model) });
    } catch (error) {
      utils.handleError(res, error);
    }
  };
}

export default BaseController;
