import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createPublicOrder, uploadPublicImage } from '../controllers/publicOrderController';
import { getDayAvailability } from '../services/availability';
import upload from '../config/multer';

const router = Router();

// A real client books once in a while, not repeatedly — this only needs to be loose
// enough for retries after a validation error, tight enough to block spam/scripts.
const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos desde esta conexión. Intenta de nuevo más tarde.' },
});

// Looser than the order limiter — one order can carry several custom-image items,
// so a client legitimately uploads more than once per booking.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas imágenes subidas desde esta conexión. Intenta de nuevo más tarde.' },
});

router.post('/', createOrderLimiter, createPublicOrder);
router.post('/upload-image', uploadLimiter, upload.single('image'), uploadPublicImage);

router.get('/availability', async (req, res) => {
  const date = req.query.date as string;
  if (!date) {
    return res.status(400).json({ error: 'date es requerido (formato YYYY-MM-DD)' });
  }

  const availability = await getDayAvailability(date);
  res.json(availability);
});

export default router;
