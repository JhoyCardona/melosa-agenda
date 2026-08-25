import { Router } from 'express';
import { listProductDesigns } from '../controllers/productDesignController';

const router = Router();

router.get('/', listProductDesigns);

export default router;
