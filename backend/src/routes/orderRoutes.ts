import { Router } from 'express';
import {
  createOrder,
  addOrderItem,
  getOrderById,
  getOrderByTicket,
  listOrders,
  getDaySummary,
  getDayGallery,
  downloadDayGalleryZip,
  getNotifications,
  updateOrder,
  updateOrderItem,
  deleteOrder,
} from '../controllers/orderController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authMiddleware, createOrder);
router.post('/:orderId/items', authMiddleware, addOrderItem);
router.get('/day-summary', authMiddleware, getDaySummary);
router.get('/day-gallery', authMiddleware, getDayGallery);
router.get('/day-gallery/zip', authMiddleware, downloadDayGalleryZip);
router.get('/notifications', authMiddleware, getNotifications);
router.get('/ticket/:ticketNumber', authMiddleware, getOrderByTicket);
router.get('/:orderId', authMiddleware, getOrderById);
router.get('/', authMiddleware, listOrders);
router.patch('/:orderId', authMiddleware, updateOrder);
router.patch('/items/:itemId', authMiddleware, updateOrderItem);
router.delete('/:orderId', authMiddleware, deleteOrder);

export default router;