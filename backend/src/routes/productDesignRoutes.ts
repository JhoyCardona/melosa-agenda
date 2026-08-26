import { Router } from 'express';
import { listProductDesigns, listAllProductDesigns, createProductDesign } from '../controllers/productDesignController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/', listProductDesigns);
router.get('/all', authMiddleware, listAllProductDesigns);
router.post('/', authMiddleware, createProductDesign);

export default router;
