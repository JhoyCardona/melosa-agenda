import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

export async function createOrder(req: AuthRequest, res: Response) {
  const { clientName, clientPhone, deliveryDate, deliveryAddress, notes } = req.body;

  if (!clientName || !clientPhone || !deliveryDate) {
    return res.status(400).json({
      error: 'clientName, clientPhone y deliveryDate son requeridos',
    });
  }

  try {
    const order = await prisma.order.create({
      data: {
        clientName,
        clientPhone,
        deliveryDate: new Date(deliveryDate),
        deliveryAddress: deliveryAddress || null,
        notes: notes || null,
      },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creando pedido:', error);
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
}

export async function addOrderItem(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;
  const { category, price, imageUrl, details } = req.body;

  const validCategories = ['CAKE', 'ALFAJOR_CAKE', 'ALFAJOR_UNIT', 'CUPCAKE', 'DESSERT'];

  if (!category || !validCategories.includes(category)) {
    return res.status(400).json({
      error: `category debe ser una de: ${validCategories.join(', ')}`,
    });
  }

  if (price === undefined || price === null) {
    return res.status(400).json({ error: 'price es requerido' });
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const item = await prisma.orderItem.create({
      data: {
        orderId,
        category,
        price,
        imageUrl: imageUrl || null,
        details: details || {},
      },
    });

    const allItems = await prisma.orderItem.findMany({ where: { orderId } });
    const newTotal = allItems.reduce((sum, i) => sum + Number(i.price), 0);

    await prisma.order.update({
      where: { id: orderId },
      data: { totalPrice: newTotal },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error agregando producto:', error);
    res.status(500).json({ error: 'Error al agregar el producto' });
  }
}

async function markExpiredOrders() {
  const now = new Date();

  await prisma.order.updateMany({
    where: {
      status: 'PENDING',
      deliveryDate: { lt: now },
    },
    data: {
      status: 'EXPIRED',
    },
  });
}

export async function getOrderById(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;

  try {
    await markExpiredOrders();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error obteniendo pedido:', error);
    res.status(500).json({ error: 'Error al obtener el pedido' });
  }
}

export async function listOrders(req: AuthRequest, res: Response) {
  const { month, year, status } = req.query;

  try {
    await markExpiredOrders();

    const where: any = {};

    if (status) {
      where.status = status as string;
    }

    if (month && year) {
      const monthNum = parseInt(month as string, 10);
      const yearNum = parseInt(year as string, 10);

      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 1);

      where.deliveryDate = {
        gte: startDate,
        lt: endDate,
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { deliveryDate: 'asc' },
    });

    res.json(orders);
  } catch (error) {
    console.error('Error listando pedidos:', error);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
}

export async function updateOrder(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;
  const { clientName, clientPhone, deliveryDate, deliveryAddress, notes, totalPrice, depositPaid, status } = req.body;

  const validStatuses = ['PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({
      error: `status debe ser una de: ${validStatuses.join(', ')}`,
    });
  }

  try {
    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...(clientName !== undefined && { clientName }),
        ...(clientPhone !== undefined && { clientPhone }),
        ...(deliveryDate !== undefined && { deliveryDate: new Date(deliveryDate) }),
        ...(deliveryAddress !== undefined && { deliveryAddress }),
        ...(notes !== undefined && { notes }),
        ...(totalPrice !== undefined && { totalPrice }),
        ...(depositPaid !== undefined && { depositPaid }),
        ...(status !== undefined && { status }),
      },
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error actualizando pedido:', error);
    res.status(500).json({ error: 'Error al actualizar el pedido' });
  }
}

export async function updateOrderItem(req: AuthRequest, res: Response) {
  const itemId = req.params.itemId as string;
  const { category, price, imageUrl, details } = req.body;

  try {
    const existingItem = await prisma.orderItem.findUnique({ where: { id: itemId } });

    if (!existingItem) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        ...(category !== undefined && { category }),
        ...(price !== undefined && { price }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(details !== undefined && { details }),
      },
    });

    if (price !== undefined) {
      const allItems = await prisma.orderItem.findMany({ where: { orderId: existingItem.orderId } });
      const newTotal = allItems.reduce((sum, i) => sum + Number(i.price), 0);

      await prisma.order.update({
        where: { id: existingItem.orderId },
        data: { totalPrice: newTotal },
      });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
}

export async function deleteOrder(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;

  try {
    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    await prisma.order.delete({ where: { id: orderId } });

    res.json({ message: 'Pedido eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando pedido:', error);
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
}
