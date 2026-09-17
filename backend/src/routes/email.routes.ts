import { Router } from 'express';
import { EmailController } from '../controllers/email.controller';

const router = Router();

router.post('/schedule', EmailController.scheduleBatch);
router.get('/scheduled', EmailController.getScheduled);
router.get('/sent', EmailController.getSent);
router.get('/search', EmailController.searchEmails);
router.get('/senders', EmailController.getSenders);
router.get('/:id', EmailController.getById);
router.delete('/:id', EmailController.delete);

export default router;
