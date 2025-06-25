import express from 'express';
import whatsAppController from '../../controllers/whatsapp.controller';

const router = express.Router();

//
// Channel Management Routes
//

router.post('/channels', whatsAppController.createChannel);
router.get('/channels', whatsAppController.listChannels);
router.post('/channels/:channelId/connect', whatsAppController.connectChannel);
router.post(
  '/channels/:channelId/disconnect',
  whatsAppController.disconnectChannel,
);
router.get('/channels/:channelId/status', whatsAppController.getChannelStatus);
router.delete('/channels/:channelId', whatsAppController.deleteChannel);

//
// Interaction Routes
//

router.get('/channels/:channelId/qr', whatsAppController.getQRCode);
router.post(
  '/channels/:channelId/pairing-code',
  whatsAppController.requestPairingCode,
);

//
// Messaging Routes
//

router.post('/channels/:channelId/send', whatsAppController.sendMessage);
router.post(
  '/channels/:channelId/send-media',
  whatsAppController.sendMediaMessage,
);
router.post(
  '/channels/:channelId/messages',
  whatsAppController.sendMessageFromApi,
);

//
// Contact Utility Routes
//

router.get(
  '/channels/:channelId/contacts/:jid/check',
  whatsAppController.checkContact,
);
router.get(
  '/channels/:channelId/contacts/:jid/status',
  whatsAppController.getContactStatus,
);
router.get(
  '/channels/:channelId/contacts/:jid/photo',
  whatsAppController.getProfilePicture,
);

//
// Webhook Management Routes
//

router.post('/channels/:channelId/webhooks', whatsAppController.addWebhook);
router.get('/channels/:channelId/webhooks', whatsAppController.listWebhooks);
router.put(
  '/channels/:channelId/webhooks/:webhookId',
  whatsAppController.updateWebhook,
);
router.delete(
  '/channels/:channelId/webhooks/:webhookId',
  whatsAppController.deleteWebhook,
);

//
// Debugging Routes
//

router.delete('/channels/:channelId/auth', whatsAppController.clearAuthState);

export default router;
