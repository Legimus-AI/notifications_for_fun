"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Cities_1 = __importDefault(require("../models/Cities"));
const BaseController_1 = __importDefault(require("./BaseController"));
class CitiesController extends BaseController_1.default {
    constructor() {
        super(Cities_1.default, ['name']);
    }
}
const controller = new CitiesController();
exports.default = controller;
//# sourceMappingURL=cities.controller.js.map