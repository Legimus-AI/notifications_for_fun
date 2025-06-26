"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_validator_1 = require("express-validator");
const utils_1 = require("../helpers/utils");
const validateRequest = (req, res, next) => {
    (0, utils_1.validationResultMiddleware)(req, res, next);
};
class BaseValidation {
    constructor() {
        this.create = [
            (0, express_validator_1.check)('name')
                .exists()
                .withMessage('Name is required')
                .not()
                .isEmpty()
                .withMessage('Name must be valid')
                .trim(),
            validateRequest,
        ];
        this.update = [
            (0, express_validator_1.check)('name')
                .exists()
                .withMessage('MISSING')
                .not()
                .isEmpty()
                .withMessage('IS_EMPTY'),
            (0, express_validator_1.check)('_id')
                .exists()
                .withMessage('MISSING')
                .not()
                .isEmpty()
                .withMessage('IS_EMPTY'),
            validateRequest,
        ];
        this.listOne = [
            (0, express_validator_1.check)('_id')
                .exists()
                .withMessage('MISSING')
                .not()
                .isEmpty()
                .withMessage('IS_EMPTY'),
            validateRequest,
        ];
        this.delete = [];
    }
    setCreate(validations) {
        this.create = validations;
    }
    setUpdate(validations) {
        this.update = validations;
    }
    setListOne(validations) {
        this.listOne = validations;
    }
    setDelete(validations) {
        this.delete = validations;
    }
}
exports.default = BaseValidation;
//# sourceMappingURL=BaseValidation.js.map