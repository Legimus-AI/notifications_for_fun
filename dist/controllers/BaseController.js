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
const utils = __importStar(require("../helpers/utils"));
const db = __importStar(require("../helpers/db"));
const BaseValidation_1 = __importDefault(require("./BaseValidation"));
class BaseController {
    constructor(model, uniqueFields = []) {
        this.validation = new BaseValidation_1.default();
        this.handleError = (res, error) => {
            utils.handleError(res, error);
        };
        // CRUD
        this.listAll = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res
                    .status(200)
                    .json({ ok: true, payload: yield db.getAllItems(this.model) });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.list = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const query = yield db.checkQueryString(req.query);
                res
                    .status(200)
                    .json(Object.assign({ ok: true }, (yield db.getItems(req, this.model, query))));
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.listOne = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const id = yield utils.isIDGood(req.params.id);
                res
                    .status(200)
                    .json({ ok: true, payload: yield db.getItem(id, this.model) });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.create = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                req.body.userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id;
                const doesItemExists = yield this.itemExists(req.body);
                if (!doesItemExists) {
                    res.status(200).json({
                        ok: true,
                        payload: yield db.createItem(req.body, this.model),
                    });
                }
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.update = (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _b;
            try {
                req.body.userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id;
                const id = yield utils.isIDGood(req.params.id);
                const doesItemExists = yield this.itemExistsExcludingItself(id, req.body);
                if (!doesItemExists) {
                    res.status(200).json({
                        ok: true,
                        payload: yield db.updateItem(id, this.model, req.body),
                    });
                }
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.delete = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const id = yield utils.isIDGood(req.params.id);
                res
                    .status(200)
                    .json({ ok: true, payload: yield db.deleteItem(id, this.model) });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        this.model = model;
        this.uniqueFields = uniqueFields;
    }
    itemExistsExcludingItself(id, body) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            // <-- Add return here
            const query = this.uniqueFields.length > 0 ? {} : { noFields: true };
            for (const uniquefield of this.uniqueFields) {
                query[uniquefield] = body[uniquefield];
            }
            query._id = {
                $ne: id,
            };
            try {
                const item = yield this.model.findOne(query);
                utils.itemAlreadyExists(null, item, reject, 'Este registro no existe');
                resolve(false);
            }
            catch (error) {
                utils.itemAlreadyExists(error, null, reject, 'Este registro no existe');
            }
        }));
    }
    itemExists(body) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            const query = this.uniqueFields.length > 0 ? {} : { noFields: true };
            for (const uniquefield of this.uniqueFields) {
                query[uniquefield] = body[uniquefield];
            }
            try {
                const item = yield this.model.findOne(query);
                utils.itemAlreadyExists(null, item, reject, 'Este registro ya existe');
                resolve(false);
            }
            catch (error) {
                utils.itemAlreadyExists(error, null, reject, 'Este registro ya existe');
            }
        }));
    }
}
exports.default = BaseController;
//# sourceMappingURL=BaseController.js.map