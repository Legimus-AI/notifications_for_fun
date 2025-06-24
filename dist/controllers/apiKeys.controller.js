"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ApiKeys_1 = __importDefault(require("../models/ApiKeys"));
const BaseController_1 = __importDefault(require("./BaseController"));
class ApiKeysController extends BaseController_1.default {
    constructor() {
        super(ApiKeys_1.default, []);
    }
}
const controller = new ApiKeysController();
exports.default = controller;
//# sourceMappingURL=apiKeys.controller.js.map