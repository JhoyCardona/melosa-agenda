import { Response } from 'express';
import { PrismaClient, TimeBlock, OrderStatus, Flavor } from '@prisma/client';
import archiver from 'archiver';
import { AuthRequest } from '../middleware/authMiddleware';
import { computePaymentDueDate } from '../utils/colombiaTime';
import { reserveSlotPoints, releaseSlotPoints } from '../services/availability';

const prisma = new PrismaClient();

const VALID_TIME_BLOCKS = Object.values(TimeBlock);
const VALID_STATUSES = Object.values(OrderStatus);
const VALID_FLAVORS = Object.values(Flavor);

export async function createOrder(req: AuthRequest, res: Response) {
  const { clientName, clientPhone, deliveryDate, timeBlock, deliveryAddress, notes } = req.body;

  if (!clientName || !clientPhone || !deliveryDate || !timeBlock) {
    return res.status(400).json({
      error: 'clientName, clientPhone, deliveryDate y timeBlock son requeridos',
    });
  }

  if (!VALID_TIME_BLOCKS.includes(timeBlock)) {
    return res.status(400).json({ error: `timeBlock debe ser uno de: ${VALID_TIME_BLOCKS.join(', ')}` });
  }

  try {
    const order = await prisma.order.create({
      data: {
        clientName,
        clientPhone,
        deliveryDate: new Date(deliveryDate),
        timeBlock,
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

// Selecciona un diseño + variante ya existentes en el catálogo (ProductDesign/ProductVariant),
// en vez de mandar category/price sueltos como antes.
export async function addOrderItem(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;
  const { productDesignId, variantId, flavor, customImageUrl, customText } = req.body;

  if (!productDesignId || !variantId || !flavor) {
    return res.status(400).json({ error: 'productDesignId, variantId y flavor son requeridos' });
  }

  if (!VALID_FLAVORS.includes(flavor)) {
    return res.status(400).json({ error: `flavor debe ser uno de: ${VALID_FLAVORS.join(', ')}` });
  }

  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant || variant.productDesignId !== productDesignId) {
      return res.status(404).json({ error: 'Variante no encontrada para ese diseño' });
    }

    const item = await prisma.$transaction(async (tx) => {
      // Reserve points same as the public booking flow does, so a manually-added
      // item can't push a block past its 12-point cap either.
      await reserveSlotPoints(tx, order.deliveryDate.toISOString().slice(0, 10), order.timeBlock, variant.points);

      const created = await tx.orderItem.create({
        data: {
          orderId,
          productDesignId,
          variantId,
          priceAtOrder: variant.price,
          pointsAtOrder: variant.points,
          flavor,
          customImageUrl: customImageUrl || null,
          customText: customText || null,
        },
      });

      const allItems = await tx.orderItem.findMany({ where: { orderId } });
      const newTotal = allItems.reduce((sum, i) => sum + Number(i.priceAtOrder), 0);

      await tx.order.update({ where: { id: orderId }, data: { totalPrice: newTotal } });

      return created;
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error agregando producto:', error);

    if (error instanceof Error && error.message.includes('no tiene suficiente disponibilidad')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: 'Error al agregar el producto' });
  }
}

// Only AWAITING_PAYMENT orders expire, and only once their paymentDueDate (computed
// in Colombia time, see utils/colombiaTime.ts) has passed. This does NOT cancel the
// order — Melosa reviews expired orders manually from the notifications section.
async function markExpiredOrders() {
  await prisma.order.updateMany({
    where: {
      status: OrderStatus.AWAITING_PAYMENT,
      paymentDueDate: { lt: new Date() },
    },
    data: {
      status: OrderStatus.EXPIRED,
    },
  });
}

export async function getOrderById(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;

  try {
    await markExpiredOrders();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { productDesign: true, variant: true } } },
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

// Lets Melosa jump straight to an order when a client sends her the ticket
// number over WhatsApp, instead of hunting day by day on the calendar.
export async function getOrderByTicket(req: AuthRequest, res: Response) {
  const ticketNumber = Number(req.params.ticketNumber);

  if (!Number.isInteger(ticketNumber)) {
    return res.status(400).json({ error: 'ticketNumber debe ser un número' });
  }

  try {
    await markExpiredOrders();

    const order = await prisma.order.findUnique({
      where: { ticketNumber },
      include: { items: { include: { productDesign: true, variant: true } } },
    });

    if (!order) {
      return res.status(404).json({ error: 'No existe un pedido con ese número de ticket' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error buscando pedido por ticket:', error);
    res.status(500).json({ error: 'Error al buscar el pedido' });
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
      include: { items: { include: { productDesign: true, variant: true } } },
      orderBy: { deliveryDate: 'asc' },
    });

    res.json(orders);
  } catch (error) {
    console.error('Error listando pedidos:', error);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
}

// Grouped by product+variant so Melosa can bake everything of one kind at once,
// before decorating pedido por pedido. Priority view per Fase 3.1.
export async function getDaySummary(req: AuthRequest, res: Response) {
  const date = req.query.date as string;
  if (!date) {
    return res.status(400).json({ error: 'date es requerido (formato YYYY-MM-DD)' });
  }

  try {
    await markExpiredOrders();

    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: new Date(`${date}T00:00:00.000Z`),
        status: { not: OrderStatus.CANCELLED },
      },
      include: { items: { include: { productDesign: true, variant: true } } },
    });

    // 3 levels: size (variant.label, e.g. "Torta 10 porciones") -> shape
    // (productDesign.shape, e.g. "Corazón") -> flavor (vainilla/chocolate).
    // This is the priority view: it tells Melosa exactly how many of each to
    // bake before she starts decorating pedido por pedido.
    interface FlavorGroup { flavor: Flavor; quantity: number }
    interface ShapeGroup { shape: string; quantity: number; flavors: FlavorGroup[] }
    interface SizeGroup { sizeLabel: string; sortKey: number; quantity: number; shapes: Map<string, ShapeGroup> }

    const sizeGroups = new Map<string, SizeGroup>();

    for (const order of orders) {
      for (const item of order.items) {
        const sizeLabel = item.variant.label;
        const shape = item.productDesign.shape ?? 'Sin forma definida';
        const flavor = item.flavor;

        let sizeGroup = sizeGroups.get(sizeLabel);
        if (!sizeGroup) {
          sizeGroup = { sizeLabel, sortKey: item.pointsAtOrder, quantity: 0, shapes: new Map() };
          sizeGroups.set(sizeLabel, sizeGroup);
        }
        sizeGroup.quantity += 1;

        let shapeGroup = sizeGroup.shapes.get(shape);
        if (!shapeGroup) {
          shapeGroup = { shape, quantity: 0, flavors: [] };
          sizeGroup.shapes.set(shape, shapeGroup);
        }
        shapeGroup.quantity += 1;

        const flavorGroup = shapeGroup.flavors.find((f) => f.flavor === flavor);
        if (flavorGroup) {
          flavorGroup.quantity += 1;
        } else {
          shapeGroup.flavors.push({ flavor, quantity: 1 });
        }
      }
    }

    const sizes = Array.from(sizeGroups.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((size) => ({
        sizeLabel: size.sizeLabel,
        quantity: size.quantity,
        shapes: Array.from(size.shapes.values()).sort((a, b) => b.quantity - a.quantity),
      }));

    res.json({ date, orderCount: orders.length, sizes });
  } catch (error) {
    console.error('Error obteniendo resumen del día:', error);
    res.status(500).json({ error: 'Error al obtener el resumen del día' });
  }
}

// Shared by getDayGallery and downloadDayGalleryZip below — the set of order items
// for a delivery day that carry a client-uploaded custom image.
async function findDayImageItems(date: string) {
  const orders = await prisma.order.findMany({
    where: {
      deliveryDate: new Date(`${date}T00:00:00.000Z`),
      status: { not: OrderStatus.CANCELLED },
    },
    include: { items: { include: { productDesign: true, variant: true } } },
  });

  return orders.flatMap((order) =>
    order.items
      .filter((item) => !!item.customImageUrl)
      .map((item) => ({
        itemId: item.id,
        ticketNumber: order.ticketNumber,
        clientName: order.clientName,
        productDesignName: item.productDesign.name,
        variantLabel: item.variant.label,
        imageUrl: item.customImageUrl as string,
      }))
  );
}

// Fase 3.3: gallery of custom-print images for a delivery day, grouped implicitly
// by returning one entry per order item (a ticket can carry more than one image).
export async function getDayGallery(req: AuthRequest, res: Response) {
  const date = req.query.date as string;
  if (!date) {
    return res.status(400).json({ error: 'date es requerido (formato YYYY-MM-DD)' });
  }

  try {
    const images = await findDayImageItems(date);
    res.json(images);
  } catch (error) {
    console.error('Error obteniendo galería del día:', error);
    res.status(500).json({ error: 'Error al obtener la galería del día' });
  }
}

// Streams a ZIP with every custom image for the day, named by ticket so Melosa can
// match each file back to its order once she's editing in Canva on the PC.
export async function downloadDayGalleryZip(req: AuthRequest, res: Response) {
  const date = req.query.date as string;
  if (!date) {
    return res.status(400).json({ error: 'date es requerido (formato YYYY-MM-DD)' });
  }

  try {
    const images = await findDayImageItems(date);
    if (images.length === 0) {
      return res.status(404).json({ error: 'No hay imágenes personalizadas para ese día' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="melosa-imagenes-${date}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => {
      console.error('Error generando ZIP de galería:', error);
      res.status(500).end();
    });
    archive.pipe(res);

    // Sequential fetches keep this simple and safe on Render's free tier — a day's
    // worth of custom images is small (a handful, not hundreds).
    const usedNames = new Set<string>();
    for (const image of images) {
      const response = await fetch(image.imageUrl);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());

      const extension = image.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
      const safeName = image.clientName.replace(/[^a-zA-Z0-9]+/g, '-');
      let fileName = `ticket-${image.ticketNumber}-${safeName}.${extension}`;
      let suffix = 2;
      while (usedNames.has(fileName)) {
        fileName = `ticket-${image.ticketNumber}-${safeName}-${suffix}.${extension}`;
        suffix += 1;
      }
      usedNames.add(fileName);

      archive.append(buffer, { name: fileName });
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error generando ZIP de galería:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar el ZIP de la galería' });
    }
  }
}

// Split in two: "porVencer" still has time to pay (reuses the already-computed
// paymentDueDate instead of a fixed days-before-delivery rule, so orders booked
// long in advance don't get flagged early), "vencidos" already missed their
// deadline (status EXPIRED, set by markExpiredOrders) and need a manual call —
// pay now or cancel. Fase 3.4 notifications section.
export async function getNotifications(req: AuthRequest, res: Response) {
  try {
    await markExpiredOrders();

    const dueSoonCutoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const include = { items: { include: { productDesign: true, variant: true } } };

    const [porVencer, vencidos] = await Promise.all([
      prisma.order.findMany({
        where: {
          OR: [
            { status: OrderStatus.PENDING_REVIEW },
            { status: OrderStatus.AWAITING_PAYMENT, paymentDueDate: { lte: dueSoonCutoff } },
          ],
        },
        include,
        orderBy: { deliveryDate: 'asc' },
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.EXPIRED },
        include,
        orderBy: { deliveryDate: 'asc' },
      }),
    ]);

    res.json({ porVencer, vencidos });
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener las notificaciones' });
  }
}

export async function updateOrder(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;
  const { clientName, clientPhone, deliveryDate, timeBlock, deliveryAddress, notes, totalPrice, depositPaid, status } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status debe ser una de: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (timeBlock && !VALID_TIME_BLOCKS.includes(timeBlock)) {
    return res.status(400).json({ error: `timeBlock debe ser uno de: ${VALID_TIME_BLOCKS.join(', ')}` });
  }

  try {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // Entering AWAITING_PAYMENT is when the payment deadline gets set (business rule:
    // 2 days before delivery, or 24h from order creation, whichever is sooner).
    const enteringAwaitingPayment =
      status === OrderStatus.AWAITING_PAYMENT && existingOrder.status !== OrderStatus.AWAITING_PAYMENT;

    const paymentDueDate = enteringAwaitingPayment
      ? computePaymentDueDate(
          (deliveryDate ? new Date(deliveryDate) : existingOrder.deliveryDate).toISOString().slice(0, 10),
          existingOrder.createdAt
        )
      : undefined;

    const oldDateStr = existingOrder.deliveryDate.toISOString().slice(0, 10);
    const newDateStr = deliveryDate !== undefined ? new Date(deliveryDate).toISOString().slice(0, 10) : oldDateStr;
    const newTimeBlock = timeBlock !== undefined ? timeBlock : existingOrder.timeBlock;
    const totalPoints = existingOrder.items.reduce((sum, i) => sum + i.pointsAtOrder, 0);

    // Marking FULLY_PAID always means the whole order is settled — auto-fill
    // depositPaid with the total unless a specific amount was sent explicitly.
    const autoFullDepositPaid =
      status === OrderStatus.FULLY_PAID && depositPaid === undefined ? existingOrder.totalPrice : undefined;

    const enteringCancelled = status === OrderStatus.CANCELLED && existingOrder.status !== OrderStatus.CANCELLED;
    const wasAlreadyCancelled = existingOrder.status === OrderStatus.CANCELLED;
    const isRescheduling = (newDateStr !== oldDateStr || newTimeBlock !== existingOrder.timeBlock) && !wasAlreadyCancelled;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      if (enteringCancelled) {
        // Cancelling frees up the slot's points — a fresh booking can now use them.
        await releaseSlotPoints(tx, oldDateStr, existingOrder.timeBlock, totalPoints);
      } else if (isRescheduling && totalPoints > 0) {
        // Moving date/block: release the old slot, then reserve on the new one —
        // throws (rolling back) if the new slot doesn't have room.
        await releaseSlotPoints(tx, oldDateStr, existingOrder.timeBlock, totalPoints);
        await reserveSlotPoints(tx, newDateStr, newTimeBlock, totalPoints);
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          ...(clientName !== undefined && { clientName }),
          ...(clientPhone !== undefined && { clientPhone }),
          ...(deliveryDate !== undefined && { deliveryDate: new Date(deliveryDate) }),
          ...(timeBlock !== undefined && { timeBlock }),
          ...(deliveryAddress !== undefined && { deliveryAddress }),
          ...(notes !== undefined && { notes }),
          ...(totalPrice !== undefined && { totalPrice }),
          ...(depositPaid !== undefined && { depositPaid }),
          ...(autoFullDepositPaid !== undefined && { depositPaid: autoFullDepositPaid }),
          ...(status !== undefined && { status }),
          ...(paymentDueDate !== undefined && { paymentDueDate }),
        },
      });
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Error actualizando pedido:', error);

    if (error instanceof Error && error.message.includes('no tiene suficiente disponibilidad')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: 'Error al actualizar el pedido' });
  }
}

export async function updateOrderItem(req: AuthRequest, res: Response) {
  const itemId = req.params.itemId as string;
  const { customImageUrl, customText } = req.body;

  try {
    const existingItem = await prisma.orderItem.findUnique({ where: { id: itemId } });

    if (!existingItem) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        ...(customImageUrl !== undefined && { customImageUrl }),
        ...(customText !== undefined && { customText }),
      },
    });

    res.json(updatedItem);
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
}

export async function deleteOrder(req: AuthRequest, res: Response) {
  const orderId = req.params.orderId as string;

  try {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    await prisma.$transaction(async (tx) => {
      if (existingOrder.status !== OrderStatus.CANCELLED) {
        const totalPoints = existingOrder.items.reduce((sum, i) => sum + i.pointsAtOrder, 0);
        await releaseSlotPoints(
          tx,
          existingOrder.deliveryDate.toISOString().slice(0, 10),
          existingOrder.timeBlock,
          totalPoints
        );
      }
      await tx.order.delete({ where: { id: orderId } });
    });

    res.json({ message: 'Pedido eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando pedido:', error);
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
}
