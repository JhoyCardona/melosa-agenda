import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import authRoutes from './routes/authRoutes';
import orderRoutes from './routes/orderRoutes';
import uploadRoutes from './routes/uploadRoutes';
import userRoutes from './routes/userRoutes';
import publicOrderRoutes from './routes/publicOrderRoutes';
import productDesignRoutes from './routes/productDesignRoutes';
import productVariantRoutes from './routes/productVariantRoutes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/user', userRoutes);
app.use('/api/public-orders', publicOrderRoutes);
app.use('/api/product-designs', productDesignRoutes);
app.use('/api/product-variants', productVariantRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Melosa Agenda API running' });
});

// Without this, a rejected upload (multer's file-size limit or the image-only
// fileFilter in config/multer.ts) falls through to Express's default error
// handler, which returns an HTML page with the server's stack trace instead of
// a clean JSON 4xx — reachable from the public, unauthenticated upload route too.
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error reaching the top-level handler:', error);

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE' ? 'La imagen no puede pesar más de 8 MB' : error.message;
    return res.status(400).json({ error: message });
  }

  // multer's fileFilter (config/multer.ts) rejects non-image uploads with a plain
  // Error, not a MulterError — this route is the only realistic way a plain Error
  // reaches here, since every controller already catches and responds on its own.
  if (error instanceof Error) {
    return res.status(400).json({ error: error.message });
  }

  next(error);
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});