import { Router } from 'express';
import { createOrder, addOrderItem, getOrderById, listOrders } from '../controllers/orderController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authMiddleware, createOrder);
router.post('/:orderId/items', authMiddleware, addOrderItem);
router.get('/:orderId', authMiddleware, getOrderById);
router.get('/', authMiddleware, listOrders);

export default router;