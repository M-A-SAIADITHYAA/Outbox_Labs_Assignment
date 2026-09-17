import { Router } from 'express';
import { SlackController } from '../controllers/slack.controller';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/install', optionalAuth, SlackController.install);
router.get('/callback', SlackController.callback);
router.get('/status', optionalAuth, SlackController.getStatus);
router.delete('/disconnect', optionalAuth, SlackController.disconnect);

export default router;
