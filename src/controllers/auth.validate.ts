import { check, ValidationChain, validationResult } from 'express-validator';
import * as utils from '../helpers/utils';

type MiddlewareFn = (req: any, res: any, next: any) => void;

/**
 * Validates register request
 */
export const register: (ValidationChain | MiddlewareFn)[] = [
  check('first_name')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY'),

  check('last_name')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY'),

  check('email')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY')
    .isEmail()
    .withMessage('EMAIL_IS_NOT_VALID'),

  check('password')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY')
    .isLength({ min: 5 })
    .withMessage('PASSWORD_TOO_SHORT_MIN_5'),

  (req, res, next) => {
    try {
      validationResult(req).throw();
      next();
    } catch (error) {
      utils.handleError(res, utils.buildErrObject(400, error.errors));
    }
  },
];

/**
 * Validates login request
 */
export const login: (ValidationChain | MiddlewareFn)[] = [
  check('email')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY')
    .isEmail()
    .withMessage('EMAIL_IS_NOT_VALID'),

  check('password')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY')
    .isLength({ min: 5 })
    .withMessage('PASSWORD_TOO_SHORT_MIN_5'),

  (req, res, next) => {
    try {
      validationResult(req).throw();
      next();
    } catch (error) {
      utils.handleError(res, utils.buildErrObject(400, error.errors));
    }
  },
];

/**
 * Validates verify request
 */
export const verify: (ValidationChain | MiddlewareFn)[] = [
  check('id')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY'),

  (req, res, next) => {
    validationResult(req).throw();
    next();
  },
];

/**
 * Validates forgot password request
 */
export const forgotPassword: (ValidationChain | MiddlewareFn)[] = [
  check('email')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY')
    .isEmail()
    .withMessage('EMAIL_IS_NOT_VALID'),

  (req, res, next) => {
    try {
      validationResult(req).throw();
      next();
    } catch (error) {
      utils.handleError(res, utils.buildErrObject(400, error.errors));
    }
  },
];

/**
 * Validates reset password request
 */
export const resetPassword: (ValidationChain | MiddlewareFn)[] = [
  check('id')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY'),

  check('password')
    .exists()
    .withMessage('MISSING')
    .not()
    .isEmpty()
    .withMessage('IS_EMPTY')
    .isLength({ min: 5 })
    .withMessage('PASSWORD_TOO_SHORT_MIN_5'),

  (req, res, next) => {
    try {
      validationResult(req).throw();
      next();
    } catch (error) {
      utils.handleError(res, utils.buildErrObject(400, error.errors));
    }
  },
];
