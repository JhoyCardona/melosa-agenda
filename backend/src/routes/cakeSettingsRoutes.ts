import { Router } from 'express';
import {
  getCakeSettings,
  createCakeSize,
  updateCakeSize,
  deleteCakeSize,
  createCakeFlavor,
  updateCakeFlavor,
  deleteCakeFlavor,
  createCakeShape,
  updateCakeShape,
  deleteCakeShape,
} from '../controllers/cakeSettingsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/', getCakeSettings);

router.post('/sizes', createCakeSize);
router.patch('/sizes/:id', updateCakeSize);
router.delete('/sizes/:id', deleteCakeSize);

router.post('/flavors', createCakeFlavor);
router.patch('/flavors/:id', updateCakeFlavor);
router.delete('/flavors/:id', deleteCakeFlavor);

router.post('/shapes', createCakeShape);
router.patch('/shapes/:id', updateCakeShape);
router.delete('/shapes/:id', deleteCakeShape);

export default router;
