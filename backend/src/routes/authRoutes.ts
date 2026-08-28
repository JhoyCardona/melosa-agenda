import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, verifyPassword } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Anti brute-force: 5 failed logins per IP per 15 min, then a 15-min cooldown.
// Successful logins don't count, so a normal sign-in never eats the budget.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.' },
});

router.post('/login', loginLimiter, login);
router.post('/verify-password', authMiddleware, verifyPassword);

export default router;
