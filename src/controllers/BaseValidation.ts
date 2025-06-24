import { check, ValidationChain } from 'express-validator';
import { validationResultMiddleware } from '../helpers/utils';
import { Request, Response, NextFunction } from 'express';

const validateRequest: any = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  validationResultMiddleware(req, res, next);
};

class BaseValidation {
  create: ValidationChain[] = [
    check('name')
      .exists()
      .withMessage('Name is required')
      .not()
      .isEmpty()
      .withMessage('Name must be valid')
      .trim(),
    validateRequest,
  ];
  update: ValidationChain[] = [
    check('name')
      .exists()
      .withMessage('MISSING')
      .not()
      .isEmpty()
      .withMessage('IS_EMPTY'),
    check('_id')
      .exists()
      .withMessage('MISSING')
      .not()
      .isEmpty()
      .withMessage('IS_EMPTY'),
    validateRequest,
  ];
  listOne: ValidationChain[] = [
    check('_id')
      .exists()
      .withMessage('MISSING')
      .not()
      .isEmpty()
      .withMessage('IS_EMPTY'),
    validateRequest,
  ];
  delete: ValidationChain[] = [];

  setCreate(validations: ValidationChain[]): void {
    this.create = validations;
  }

  setUpdate(validations: ValidationChain[]): void {
    this.update = validations;
  }

  setListOne(validations: ValidationChain[]): void {
    this.listOne = validations;
  }

  setDelete(validations: ValidationChain[]): void {
    this.delete = validations;
  }
}

export default BaseValidation;
