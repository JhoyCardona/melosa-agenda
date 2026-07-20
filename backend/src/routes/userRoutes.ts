import { Router } from 'express';
import { savePushToken } from '../controllers/userController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/push-token', authMiddleware, savePushToken);

export default router;