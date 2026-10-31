import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createPublicOrder, uploadPublicImage } from '../controllers/publicOrderController';
import {
  openManagedOrder,
  previewOrderChange,
  modifyManagedOrder,
  cancelManagedOrder,
} from '../controllers/orderManageController';
import { getDeliveryPreview } from '../services/availability';
import { isValidIsoDate } from '../utils/colombiaTime';
import upload from '../config/multer';
import { getPublicCakeCatalog, PRINT_IMAGE_PRICES, CATALOG_LINES, parseCatalogLine } from '../services/cakeCatalog';

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

// "Modificar mi pedido" (private link + phone + ticket). Only failed lookups
// count — 5 wrong phone/ticket guesses per 15 minutes — so a real client
// previewing several changes is never locked out, but nobody can brute-force
// someone else's order.
const manageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  requestWasSuccessful: (req, res) => res.statusCode !== 404,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.' },
});
router.post('/manage/open', manageLimiter, openManagedOrder);
router.post('/manage/preview', manageLimiter, previewOrderChange);
router.post('/manage/modify', manageLimiter, modifyManagedOrder);
router.post('/manage/cancel', manageLimiter, cancelManagedOrder);

// Catalog v2 cakes the public can book (designs + their complete colors, and
// the active flavors with their per-size surcharges). ?category=ALFAJOR_CAKE
// for alfajor cakes, ?category=ALL for every line (cart and order-edit pages,
// which may hold both); no param = cakes only.
router.get('/cake-catalog', async (req, res) => {
  const lines = req.query.category === 'ALL' ? [...CATALOG_LINES] : [parseCatalogLine(req.query.category)];
  if (lines.includes(null)) return res.status(400).json({ error: 'category no válida' });
  try {
    res.json(await getPublicCakeCatalog(lines.filter((l) => l !== null)));
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
