import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createPublicOrder, uploadPublicImage } from '../controllers/publicOrderController';
import { getDeliveryPreview } from '../services/availability';
import { isValidIsoDate } from '../utils/colombiaTime';
import upload from '../config/multer';
import { getPublicCakeCatalog, PRINT_IMAGE_PRICES } from '../services/cakeCatalog';

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

// Catalog v2 cakes the public can book (designs + their complete colors, and
// the active flavors with their per-size surcharges).
router.get('/cake-catalog', async (req, res) => {
  try {
    res.json(await getPublicCakeCatalog());
  } catch (error) {
    console.error('Error cargando catálogo de tortas:', error);
    res.status(500).json({ error: 'No se pudo cargar el catálogo. Intenta de nuevo.' });
  }
});
// Print-image surcharges for booking pages that don't load the cake catalog
// (the alfajor minicake's page).
router.get('/print-image-prices', (req, res) => {
  res.json(PRINT_IMAGE_PRICES);
});
router.post('/upload-image', uploadLimiter, upload.single('image'), uploadPublicImage);

// Preview for the booking form: given the delivery date and how many minutes the
// cart needs (sum of variant prepMinutes), returns the pickup time it would get
// and whether it still fits before 8:30pm.
router.get('/availability', async (req, res) => {
  const date = req.query.date as string;
  if (!date) {
    return res.status(400).json({ error: 'date es requerido (formato YYYY-MM-DD)' });
  }
  if (!isValidIsoDate(date)) {
    return res.status(400).json({ error: 'date debe ser una fecha válida con formato YYYY-MM-DD' });
  }

  const minutes = Number(req.query.minutes ?? 0);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return res.status(400).json({ error: 'minutes debe ser un número mayor o igual a 0' });
  }

  try {
    const preview = await getDeliveryPreview(date, minutes);
    res.json(preview);
  } catch (error) {
    console.error('Error calculando disponibilidad:', error);
    res.status(500).json({ error: 'No se pudo calcular la disponibilidad. Intenta de nuevo.' });
  }
});

export default router;
