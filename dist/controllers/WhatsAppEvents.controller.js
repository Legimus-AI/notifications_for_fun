"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WhatsAppEvents_1 = __importDefault(require("../models/WhatsAppEvents"));
const BaseController_1 = __importDefault(require("./BaseController"));
class WhatsAppEventsController extends BaseController_1.default {
    constructor() {
        super(WhatsAppEvents_1.default, []);
    }
}
const controller = new WhatsAppEventsController();
exports.default = controller;
//# sourceMappingURL=WhatsAppEvents.controller.js.map