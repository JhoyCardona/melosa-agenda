import { Router } from 'express';
import {
  updateProductVariant,
  deleteProductVariant,
} from '../controllers/productDesignController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.patch('/:variantId', authMiddleware, updateProductVariant);
router.delete('/:variantId', authMiddleware, deleteProductVariant);

export default router;
