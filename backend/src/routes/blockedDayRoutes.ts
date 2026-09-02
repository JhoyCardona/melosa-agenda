import { Router } from 'express';
import { listBlockedDays, createBlockedDays, deleteBlockedDay } from '../controllers/blockedDayController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authMiddleware, listBlockedDays);
router.post('/', authMiddleware, createBlockedDays);
router.delete('/:date', authMiddleware, deleteBlockedDay);

export default router;
