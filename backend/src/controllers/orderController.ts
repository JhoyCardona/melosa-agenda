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
