import express from 'express';
import telegramController from '../../controllers/telegram.controller';

const router = express.Router();

//
// Channel Management Routes
//

router.post('/channels', telegramController.createChannel);
router.get('/channels', telegramController.listChannels);
router.delete('/channels/:channelId', telegramController.deleteChannel);

//
// Messaging Routes
//

router.post(
  '/channels/:channelId/send-message',
  telegramController.sendMessage,
);

export default router;

