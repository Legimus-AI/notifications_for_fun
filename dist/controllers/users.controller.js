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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const Users_1 = __importDefault(require("../models/Users"));
const utils = __importStar(require("../helpers/utils"));
const db = __importStar(require("../helpers/db"));
const emailer = __importStar(require("../helpers/emailer"));
const BaseController_1 = __importDefault(require("./BaseController"));
/** *******************
 * Private functions *
 ******************** */
/**
 * Creates a new item in database
 * @param {Object} req - request object
 */
const createItem = (body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = new Users_1.default(body);
        user.verification = (0, uuid_1.v4)();
        const savedUser = yield user.save();
        const removeProperties = (userObj) => {
            const sanitizedUser = Object.assign({}, userObj);
            delete sanitizedUser.password;
            delete sanitizedUser.blockExpires;
            delete sanitizedUser.loginAttempts;
            return sanitizedUser;
        };
        return removeProperties(savedUser.toObject());
    }
    catch (err) {
        throw utils.buildErrObject(422, err.message);
    }
});
class UsersController extends BaseController_1.default {
    constructor() {
        super(Users_1.default, ['email']);
        this.create = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { body } = req;
                const doesEmailExists = yield emailer.emailExists(body.email);
                if (!doesEmailExists) {
                    const item = yield createItem(body);
                    emailer.sendRegistrationEmailMessage(item);
                    res.status(201).json(item);
                }
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.update = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { body } = req;
                const id = yield utils.isIDGood(req.params.id);
                const doesEmailExists = yield emailer.emailExistsExcludingMyself(id, body.email);
                if (!doesEmailExists) {
                    res.status(200).json(yield db.updateItem(id, Users_1.default, body));
                }
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
    }
}
const controller = new UsersController();
exports.default = controller;
//# sourceMappingURL=users.controller.js.map