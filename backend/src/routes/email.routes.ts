import { Router } from 'express';
import { EmailController } from '../controllers/email.controller';

const router = Router();

router.post('/schedule', EmailController.scheduleBatch);
router.get('/scheduled', EmailController.getScheduled);
router.get('/sent', EmailController.getSent);

export default router;
