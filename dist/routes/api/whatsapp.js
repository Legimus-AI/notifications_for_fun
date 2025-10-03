"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const whatsapp_controller_1 = __importDefault(require("../../controllers/whatsapp.controller"));
const router = express_1.default.Router();
//
// Channel Management Routes
//
router.post('/channels', whatsapp_controller_1.default.createChannel);
router.get('/channels', whatsapp_controller_1.default.listChannels);
router.post('/channels/:channelId/connect', whatsapp_controller_1.default.connectChannel);
router.post('/channels/:channelId/disconnect', whatsapp_controller_1.default.disconnectChannel);
router.get('/channels/:channelId/status', whatsapp_controller_1.default.getChannelStatus);
router.delete('/channels/:channelId', whatsapp_controller_1.default.deleteChannel);
//
// Interaction Routes
//
router.get('/channels/:channelId/qr', whatsapp_controller_1.default.getQRCode);
router.post('/channels/:channelId/qr/refresh', whatsapp_controller_1.default.refreshQR);
router.post('/channels/:channelId/pairing-code', whatsapp_controller_1.default.requestPairingCode);
//
// Messaging Routes
//
router.post('/channels/:channelId/send', whatsapp_controller_1.default.sendMessage);
router.post('/channels/:channelId/send-media', whatsapp_controller_1.default.sendMediaMessage);
router.post('/channels/:channelId/messages', whatsapp_controller_1.default.sendMessageFromApi);
//
// Contact Utility Routes
//
router.get('/channels/:channelId/contacts/:jid/check', whatsapp_controller_1.default.checkContact);
router.get('/channels/:channelId/contacts/:jid/status', whatsapp_controller_1.default.getContactStatus);
router.get('/channels/:channelId/contacts/:jid/photo', whatsapp_controller_1.default.getProfilePicture);
//
// Webhook Management Routes
//
router.post('/channels/:channelId/webhooks', whatsapp_controller_1.default.addWebhook);
router.get('/channels/:channelId/webhooks', whatsapp_controller_1.default.listWebhooks);
router.put('/channels/:channelId/webhooks/:webhookId', whatsapp_controller_1.default.updateWebhook);
router.delete('/channels/:channelId/webhooks/:webhookId', whatsapp_controller_1.default.deleteWebhook);
//
// LID Management Routes
//
router.get('/channels/:channelId/lids', whatsapp_controller_1.default.getAllLids);
router.get('/channels/:channelId/lids/count', whatsapp_controller_1.default.getLidsCount);
router.get('/channels/:channelId/lids/:lid', whatsapp_controller_1.default.getPhoneNumberByLid);
router.get('/channels/:channelId/lids/pn/:phoneNumber', whatsapp_controller_1.default.getLidByPhoneNumber);
//
// Debugging Routes
//
router.delete('/channels/:channelId/auth', whatsapp_controller_1.default.clearAuthState);
exports.default = router;
//# sourceMappingURL=whatsapp.js.map