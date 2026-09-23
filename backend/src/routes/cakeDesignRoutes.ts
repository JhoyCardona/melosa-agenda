import { Router } from 'express';
import {
  listCakeDesigns,
  createCakeDesign,
  updateCakeDesign,
  createDesignColor,
  updateDesignColor,
  deleteDesignColor,
  saveColorConfig,
} from '../controllers/cakeDesignController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get('/', listCakeDesigns);
router.post('/', createCakeDesign);
router.patch('/:id', updateCakeDesign);

router.post('/:id/colors', createDesignColor);
router.patch('/colors/:colorId', updateDesignColor);
router.delete('/colors/:colorId', deleteDesignColor);
router.put('/colors/:colorId/config', saveColorConfig);

export default router;
