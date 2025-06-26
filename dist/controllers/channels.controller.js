"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Channels_1 = __importDefault(require("../models/Channels"));
const BaseController_1 = __importDefault(require("./BaseController"));
class ChannelsController extends BaseController_1.default {
    constructor() {
        super(Channels_1.default, []);
    }
}
const controller = new ChannelsController();
exports.default = controller;
//# sourceMappingURL=channels.controller.js.map