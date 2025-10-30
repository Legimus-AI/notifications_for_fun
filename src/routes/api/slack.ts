import express from 'express';
import slackController from '../../controllers/slack.controller';

const router = express.Router();

//
// Channel Management Routes
//

router.post('/channels', slackController.createChannel);
router.get('/channels', slackController.listChannels);
router.delete('/channels/:channelId', slackController.deleteChannel);

//
// Messaging Routes
//

router.post('/channels/:channelId/send-message', slackController.sendMessage);

export default router;
