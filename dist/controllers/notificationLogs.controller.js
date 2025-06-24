"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const NotificationLogs_1 = __importDefault(require("../models/NotificationLogs"));
const BaseController_1 = __importDefault(require("./BaseController"));
class NotificationsController extends BaseController_1.default {
    constructor() {
        super(NotificationLogs_1.default, []);
    }
}
const controller = new NotificationsController();
exports.default = controller;
//# sourceMappingURL=notificationLogs.controller.js.map