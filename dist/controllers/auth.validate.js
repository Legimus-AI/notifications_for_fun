"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.verify = exports.login = exports.register = void 0;
const express_validator_1 = require("express-validator");
const utils = __importStar(require("../helpers/utils"));
/**
 * Validates register request
 */
exports.register = [
    (0, express_validator_1.check)('first_name')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY'),
    (0, express_validator_1.check)('last_name')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY'),
    (0, express_validator_1.check)('email')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY')
        .isEmail()
        .withMessage('EMAIL_IS_NOT_VALID'),
    (0, express_validator_1.check)('password')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY')
        .isLength({ min: 5 })
        .withMessage('PASSWORD_TOO_SHORT_MIN_5'),
    (req, res, next) => {
        try {
            (0, express_validator_1.validationResult)(req).throw();
            next();
        }
        catch (error) {
            utils.handleError(res, utils.buildErrObject(400, error.errors));
        }
    },
];
/**
 * Validates login request
 */
exports.login = [
    (0, express_validator_1.check)('email')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY')
        .isEmail()
        .withMessage('EMAIL_IS_NOT_VALID'),
    (0, express_validator_1.check)('password')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY')
        .isLength({ min: 5 })
        .withMessage('PASSWORD_TOO_SHORT_MIN_5'),
    (req, res, next) => {
        try {
            (0, express_validator_1.validationResult)(req).throw();
            next();
        }
        catch (error) {
            utils.handleError(res, utils.buildErrObject(400, error.errors));
        }
    },
];
/**
 * Validates verify request
 */
exports.verify = [
    (0, express_validator_1.check)('id')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY'),
    (req, res, next) => {
        (0, express_validator_1.validationResult)(req).throw();
        next();
    },
];
/**
 * Validates forgot password request
 */
exports.forgotPassword = [
    (0, express_validator_1.check)('email')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY')
        .isEmail()
        .withMessage('EMAIL_IS_NOT_VALID'),
    (req, res, next) => {
        try {
            (0, express_validator_1.validationResult)(req).throw();
            next();
        }
        catch (error) {
            utils.handleError(res, utils.buildErrObject(400, error.errors));
        }
    },
];
/**
 * Validates reset password request
 */
exports.resetPassword = [
    (0, express_validator_1.check)('id')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY'),
    (0, express_validator_1.check)('password')
        .exists()
        .withMessage('MISSING')
        .not()
        .isEmpty()
        .withMessage('IS_EMPTY')
        .isLength({ min: 5 })
        .withMessage('PASSWORD_TOO_SHORT_MIN_5'),
    (req, res, next) => {
        try {
            (0, express_validator_1.validationResult)(req).throw();
            next();
        }
        catch (error) {
            utils.handleError(res, utils.buildErrObject(400, error.errors));
        }
    },
];
//# sourceMappingURL=auth.validate.js.map