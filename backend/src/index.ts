import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import orderRoutes from './routes/orderRoutes';
import uploadRoutes from './routes/uploadRoutes';
import userRoutes from './routes/userRoutes';
import publicOrderRoutes from './routes/publicOrderRoutes';
import productDesignRoutes from './routes/productDesignRoutes';

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

app.get('/', (req, res) => {
  res.json({ message: 'Melosa Agenda API running' });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});