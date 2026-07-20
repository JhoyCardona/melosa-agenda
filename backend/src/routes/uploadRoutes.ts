import { Router } from 'express';
import { uploadImage } from '../controllers/uploadController';
import { authMiddleware } from '../middleware/authMiddleware';
import upload from '../config/multer';

const router = Router();

router.post('/', authMiddleware, upload.single('image'), uploadImage);

export default router;