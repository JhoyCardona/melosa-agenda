import { Router } from 'express';
import {
  createOrder,
  addOrderItem,
  getOrderById,
  listOrders,
  updateOrder,
  updateOrderItem,
  deleteOrder,
} from '../controllers/orderController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authMiddleware, createOrder);
router.post('/:orderId/items', authMiddleware, addOrderItem);
router.get('/:orderId', authMiddleware, getOrderById);
router.get('/', authMiddleware, listOrders);
router.patch('/:orderId', authMiddleware, updateOrder);
router.patch('/items/:itemId', authMiddleware, updateOrderItem);
router.delete('/:orderId', authMiddleware, deleteOrder);

export default router;