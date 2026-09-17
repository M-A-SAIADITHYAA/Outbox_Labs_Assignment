import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { optionalAuth, authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/google', AuthController.googleLogin);
router.get('/google/url', AuthController.getGoogleUrl);
router.get('/google/callback', AuthController.googleCallback);
router.get('/me', optionalAuth, AuthController.getMe);
router.post('/logout', AuthController.logout);
router.post('/dev-login', AuthController.devLogin);

export default router;
