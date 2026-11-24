import { Router } from 'express';
import {
  getAlfajorBoxes,
  createAlfajorQuantity,
  updateAlfajorQuantity,
  deleteAlfajorQuantity,
  createAlfajorBox,
  updateAlfajorBox,
  deleteAlfajorBox,
  setAlfajorBoxPrices,
} from '../controllers/alfajorBoxController';
import { authMiddleware } from '../middleware/authMiddleware';

// Admin-only: quantities and box decorations of small alfajores.
const router = Router();

router.use(authMiddleware);

router.get('/', getAlfajorBoxes);

router.post('/quantities', createAlfajorQuantity);
router.patch('/quantities/:id', updateAlfajorQuantity);
router.delete('/quantities/:id', deleteAlfajorQuantity);

router.post('/boxes', createAlfajorBox);
router.patch('/boxes/:id', updateAlfajorBox);
router.delete('/boxes/:id', deleteAlfajorBox);
router.put('/boxes/:id/prices', setAlfajorBoxPrices);

export default router;
