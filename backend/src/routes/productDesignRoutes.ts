import { Router } from 'express';
import {
  listProductDesigns,
  listAllProductDesigns,
  createProductDesign,
  updateProductDesign,
  addProductVariant,
} from '../controllers/productDesignController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/', listProductDesigns);
router.get('/all', authMiddleware, listAllProductDesigns);
router.post('/', authMiddleware, createProductDesign);
router.patch('/:id', authMiddleware, updateProductDesign);
router.post('/:id/variants', authMiddleware, addProductVariant);

export default router;
