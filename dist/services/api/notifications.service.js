"use strict";
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
exports.notificationsService = exports.NotificationsService = void 0;
const NotificationServiceFactory_1 = require("../../factories/NotificationServiceFactory");
/**
 * Notifications Service - Internal service for sending notifications
 * Uses adapters through the factory to send messages across different providers
 */
class NotificationsService {
    /**
     * Sends a notification through the specified provider
     */
    sendNotification(provider, channelId, recipient, message, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Create the appropriate adapter using the factory
            const adapter = NotificationServiceFactory_1.NotificationServiceFactory.createAdapter(provider);
            // Send the notification through the adapter
            const result = yield adapter.send(channelId, recipient, message, options);
            return result;
        });
    }
    /**
     * Sends notifications to multiple providers
     */
    sendMultipleNotifications(notifications) {
        return __awaiter(this, void 0, void 0, function* () {
            // Send all notifications in parallel
            const results = yield Promise.allSettled(notifications.map((notification) => __awaiter(this, void 0, void 0, function* () {
                const { provider, channelId, recipient, message, options } = notification;
                return this.sendNotification(provider, channelId, recipient, message, options);
            })));
            // Format results
            const formattedResults = results.map((result, index) => {
                var _a;
                return ({
                    provider: notifications[index].provider,
                    recipient: notifications[index].recipient,
                    success: result.status === 'fulfilled',
                    data: result.status === 'fulfilled' ? result.value : null,
                    error: result.status === 'rejected' ? (_a = result.reason) === null || _a === void 0 ? void 0 : _a.message : null,
                });
            });
            return formattedResults;
        });
    }
}
exports.NotificationsService = NotificationsService;
exports.notificationsService = new NotificationsService();
//# sourceMappingURL=notifications.service.js.map