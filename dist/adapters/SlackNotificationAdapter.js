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
exports.SlackNotificationAdapter = void 0;
const SlackService_1 = require("../services/SlackService");
/**
 * Slack Adapter - Adapts SlackService to INotificationProvider interface
 * This is an Adapter in the Adapter pattern
 */
class SlackNotificationAdapter {
    /**
     * Sends a message through Slack
     */
    send(channelId, recipient, message, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Adapt the parameters to match SlackService's expected format
            const slackMessage = {
                channel: recipient, // recipient is the Slack channel ID
                text: message,
            };
            // Add optional parameters if provided
            if (options === null || options === void 0 ? void 0 : options.blocks) {
                slackMessage.blocks = options.blocks;
            }
            if (options === null || options === void 0 ? void 0 : options.attachments) {
                slackMessage.attachments = options.attachments;
            }
            if (options === null || options === void 0 ? void 0 : options.thread_ts) {
                slackMessage.thread_ts = options.thread_ts;
            }
            // Call the underlying SlackService
            const result = yield SlackService_1.slackService.sendMessage(channelId, slackMessage);
            return {
                success: true,
                provider: 'slack',
                messageId: result.ts,
                channel: result.channel,
                data: result,
            };
        });
    }
    /**
     * Returns the provider type
     */
    getProviderType() {
        return 'slack';
    }
}
exports.SlackNotificationAdapter = SlackNotificationAdapter;
//# sourceMappingURL=SlackNotificationAdapter.js.map