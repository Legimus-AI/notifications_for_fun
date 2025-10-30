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
Object.defineProperty(exports, "__esModule", { value: true });
const utils = __importStar(require("../helpers/utils"));
const notifications_service_1 = require("../services/api/notifications.service");
class NotificationsController {
    constructor() {
        /**
         * Send notification through any provider
         * POST /api/notifications/send
         */
        this.send = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { provider, channelId, recipient, message, options } = req.body;
                // Validate required fields
                if (!provider) {
                    return utils.handleError(res, utils.buildErrObject(400, 'PROVIDER_REQUIRED'));
                }
                if (!channelId) {
                    return utils.handleError(res, utils.buildErrObject(400, 'CHANNEL_ID_REQUIRED'));
                }
                if (!recipient) {
                    return utils.handleError(res, utils.buildErrObject(400, 'RECIPIENT_REQUIRED'));
                }
                if (!message) {
                    return utils.handleError(res, utils.buildErrObject(400, 'MESSAGE_REQUIRED'));
                }
                // Send notification through the service
                const result = yield notifications_service_1.notificationsService.sendNotification(provider, channelId, recipient, message, options);
                res.status(200).json({
                    ok: true,
                    message: 'Notification sent successfully',
                    payload: result,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
        /**
         * Send notifications to multiple providers
         * POST /api/notifications/send-multi
         */
        this.sendMulti = (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const { notifications } = req.body;
                if (!notifications || !Array.isArray(notifications)) {
                    return utils.handleError(res, utils.buildErrObject(400, 'NOTIFICATIONS_ARRAY_REQUIRED'));
                }
                // Send notifications through the service
                const results = yield notifications_service_1.notificationsService.sendMultipleNotifications(notifications);
                res.status(200).json({
                    ok: true,
                    message: 'Multi-provider notification sent',
                    payload: results,
                });
            }
            catch (error) {
                utils.handleError(res, error);
            }
        });
    }
}
const notificationsController = new NotificationsController();
exports.default = notificationsController;
//# sourceMappingURL=notifications.controller.js.map