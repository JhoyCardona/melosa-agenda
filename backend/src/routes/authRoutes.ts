import { Router } from 'express';
import { login, verifyPassword } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', login);
router.post('/verify-password', authMiddleware, verifyPassword);

export default router;
