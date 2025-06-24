"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Webhooks_1 = __importDefault(require("../models/Webhooks"));
const BaseController_1 = __importDefault(require("./BaseController"));
class WebhooksController extends BaseController_1.default {
    constructor() {
        super(Webhooks_1.default, []);
    }
}
const controller = new WebhooksController();
exports.default = controller;
//# sourceMappingURL=webhooks.controller.js.map