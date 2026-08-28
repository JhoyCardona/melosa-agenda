import { Response } from 'express';
import { PrismaClient, Prisma, OrderStatus, Flavor } from '@prisma/client';
import archiver from 'archiver';
import { AuthRequest } from '../middleware/authMiddleware';
import { computePaymentDueDate } from '../utils/colombiaTime';
import { reserveDeliverySlot, minutesToLabel, isNotEnoughRoomError } from '../services/availability';

const prisma = new PrismaClient();

const VALID_STATUSES = Object.values(OrderStatus);
const VALID_FLAVORS = Object.values(Flavor);

function dateStrOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface OrderItemInput {
  productDesignId: string;
  variantId: string;
  flavor: Flavor;
  customImageUrl?: string;
  customText?: string;
}

// Re-place an order on its delivery day's timeline: recompute its duration from
// its current items and append it at the end of that day's queue. The order's
// previous slot is simply left as a gap (rest time) — the day cursor never moves
// back. Used after items change or a reschedule. Runs inside a transaction.
async function reEnqueueOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { variant: true } } },
  });
  // Custom lines (no catalog variant) don't consume timeline minutes.
  const rawDurationMin = order.items.reduce((sum, i) => sum + (i.variant?.prepMinutes ?? 0), 0);
  const dateStr = dateStrOf(order.deliveryDate);
  const slot = await reserveDeliverySlot(tx, dateStr, rawDurationMin);
  await tx.order.update({
    where: { id: orderId },
    data: {
      deliveryStartMinutes: slot.startMinutes,
      deliveryDurationMin: slot.durationMin,
      // While the order is still awaiting payment, keep its deadline anchored to
      // the new pickup time — a reschedule to another day (or an added item)
      // moves the pickup, so the "pickup - 24h" deadline must move with it.
      ...(order.status === OrderStatus.AWAITING_PAYMENT && {
        paymentDueDate: computePaymentDueDate(dateStr, slot.startMinutes + slot.durationMin),
      }),
    },
  });
}

// Manual order creation from the mobile app. The whole order (all its items)
// arrives in one call so its delivery slot can be reserved once, contiguously.
// `deliveryStartMinutes` is optional: pass it when seeding the backlog of orders
// Melosa already promised a time for; omit it to append at the end of the day.
export async function createOrder(req: AuthRequest, res: Response) {
  const {
    clientName,
    clientPhone,
    deliveryDate,
    deliveryAddress,
    notes,
    deliveryStartMinutes,
    items,
  } = req.body;

  if (!clientName || !clientPhone || !deliveryDate) {
    return res.status(400).json({
      error: 'clientName, clientPhone y deliveryDate son requeridos',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items debe ser un arreglo con al menos un producto' });
  }

  if (
    deliveryStartMinutes !== undefined &&
    (typeof deliveryStartMinutes !== 'number' ||
      !Number.isInteger(deliveryStartMinutes) ||
      deliveryStartMinutes < 0)
  ) {
    return res.status(400).json({ error: 'deliveryStartMinutes debe ser un entero mayor o igual a 0' });
  }

  try {
    const variantIds = (items as OrderItemInput[]).map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({ where: { id: { in: variantIds } } });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    for (const item of items as OrderItemInput[]) {
      const variant = variantById.get(item.variantId);
      if (!variant || variant.productDesignId !== item.productDesignId) {
        return res.status(404).json({ error: 'Una de las variantes seleccionadas no existe para ese diseño' });
      }
      if (!item.flavor || !VALID_FLAVORS.includes(item.flavor)) {
        return res.status(400).json({ error: `flavor debe ser uno de: ${VALID_FLAVORS.join(', ')}` });
      }
    }

    const totalPrice = (items as OrderItemInput[]).reduce(
      (sum, i) => sum + Number(variantById.get(i.variantId)!.price),
      0
    );
    const rawDurationMin = (items as OrderItemInput[]).reduce(
      (sum, i) => sum + variantById.get(i.variantId)!.prepMinutes,
      0
    );

    const order = await prisma.$transaction(async (tx) => {
      const slot = await reserveDeliverySlot(tx, deliveryDate, rawDurationMin, deliveryStartMinutes);

      // Manual orders also start in AWAITING_PAYMENT (schema default) with the
      // deadline counting from now — pickup time minus 24h.
      const pickupMinutes = slot.startMinutes + slot.durationMin;

      return tx.order.create({
        data: {
          clientName,
          clientPhone,
          deliveryDate: new Date(deliveryDate),
          deliveryStartMinutes: slot.startMinutes,
          deliveryDurationMin: slot.durationMin,
          deliveryAddress: deliveryAddress || null,
          notes: notes || null,
          paymentDueDate: computePaymentDueDate(deliveryDate, pickupMinutes),
          totalPrice,
          items: {
            create: (items as OrderItemInput[]).map((item) => {
              const variant = variantById.get(item.variantId)!;
              return {
                productDesignId: item.productDesignId,
                variantId: item.variantId,
                priceAtOrder: variant.price,
                pointsAtOrder: variant.points,
                flavor: item.flavor,
                customImageUrl: item.customImageUrl || null,
                customText: item.customText || null,
              };
            }),
          },
        },
        include: { items: { include: { productDesign: true, variant: true } } },
      });
    });

    res.status(201).json({
      ...order,
      deliveryTimeLabel: minutesToLabel(order.deliveryStartMinutes + order.deliveryDurationMin),
    });
  } catch (error) {
    console.error('Error creando pedido:', error);

    if (isNotEnoughRoomError(error)) {
      return res.status(409).json({ error: (error as Error).message });
    }

    res.status(500).json({ error: 'Error al crear el pedido' });
  }
}

// Adds one item to an order that's already scheduled. Because the order gets
// longer, it's re-placed at the end of its day's queue (its old slot stays as a
// gap) and its pickup time changes. The normal path is to build the whole order
// up front in createOrder; this is for "the client called back, add one more".
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

      // Re-place the (now longer) order at the end of its day's queue.
      await reEnqueueOrder(tx, orderId);

      return created;
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error agregando producto:', error);

    if (isNotEnoughRoomError(error)) {
      return res.status(409).json({ error: (error as Error).message });
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
      orderBy: [{ deliveryDate: 'asc' }, { deliveryStartMinutes: 'asc' }],
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

    // Only orders with a confirmed payment reach the bake summary — Melosa must
    // never bake something that hasn't been paid. Unpaid orders still show in the
    // per-order detail (with a "NO PAGÓ" badge), just not here.
    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: new Date(`${date}T00:00:00.000Z`),
        status: { in: [OrderStatus.DEPOSIT_PAID, OrderStatus.FULLY_PAID, OrderStatus.COMPLETED] },
      },
      include: { items: { include: { productDesign: true, variant: true } } },
    });

    // 3 levels: size (variant.label, e.g. "Torta 10 porciones") -> shape
    // (productDesign.shape, e.g. "Corazón") -> flavor (vainilla/chocolate).
    // This is the priority view: it tells Melosa exactly how many of each to
    // bake before she starts decorating pedido por pedido. Custom admin lines
    // (no catalog variant/design) fall back to their hand-typed values.
    interface FlavorGroup { flavor: string; quantity: number }
    interface ShapeGroup { shape: string; quantity: number; flavors: FlavorGroup[] }
    interface SizeGroup { sizeLabel: string; sortKey: number; quantity: number; shapes: Map<string, ShapeGroup> }

    const sizeGroups = new Map<string, SizeGroup>();

    for (const order of orders) {
      for (const item of order.items) {
        const sizeLabel = item.variant?.label ?? item.customName ?? 'Personalizado';
        const shape = item.productDesign?.shape ?? 'Sin forma definida';
        const flavor = item.flavor ?? item.customFlavor ?? 'Sin sabor definido';

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
      // Images stay downloadable for orders still in play, including
      // AWAITING_PAYMENT — Melosa can prep the artwork before the transfer lands.
      // CANCELLED and EXPIRED are hidden; a lapsed order only reappears here if she
      // manually records a payment (which moves it to DEPOSIT_PAID).
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.EXPIRED] },
      // To restrict the gallery to paid orders only, swap the line above for:
      // status: { in: [OrderStatus.DEPOSIT_PAID, OrderStatus.FULLY_PAID, OrderStatus.COMPLETED] },
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
        productDesignName: item.productDesign?.name ?? item.customName ?? 'Personalizado',
        variantLabel: item.variant?.label ?? '',
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
    await markExpiredOrders();
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
    await markExpiredOrders();
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

// Split in two: "porVencer" = unpaid orders whose payment deadline is within the
// next 3 days (so Melosa can chase the transfer before the 24h-before-delivery
// cutoff kicks in), "vencidos" = already past that deadline (status EXPIRED, set
// by markExpiredOrders) — pay now or cancel. Fase 3.4 notifications section.
export async function getNotifications(req: AuthRequest, res: Response) {
  try {
    await markExpiredOrders();

    const dueSoonCutoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const include = { items: { include: { productDesign: true, variant: true } } };

    const [porVencer, vencidos] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: OrderStatus.AWAITING_PAYMENT,
          depositPaid: 0,
          paymentDueDate: { lte: dueSoonCutoff },
        },
        include,
        orderBy: [{ deliveryDate: 'asc' }, { deliveryStartMinutes: 'asc' }],
      }),
      prisma.order.findMany({
        where: { status: OrderStatus.EXPIRED },
        include,
        orderBy: [{ deliveryDate: 'asc' }, { deliveryStartMinutes: 'asc' }],
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
  const { clientName, clientPhone, deliveryDate, deliveryAddress, notes, totalPrice, depositPaid, status } = req.body;

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status debe ser una de: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (depositPaid !== undefined && (typeof depositPaid !== 'number' || Number.isNaN(depositPaid) || depositPaid < 0)) {
    return res.status(400).json({ error: 'depositPaid debe ser un número mayor o igual a 0' });
  }

  try {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // A FULLY_PAID/COMPLETED order already has confirmed money on record — cancelling
    // it would silently wipe that depositPaid amount, so it's blocked outright rather
    // than left to the mobile UI (which just hides the button) to enforce.
    if (
      status === OrderStatus.CANCELLED &&
      (existingOrder.status === OrderStatus.FULLY_PAID || existingOrder.status === OrderStatus.COMPLETED)
    ) {
      return res.status(409).json({ error: 'No se puede cancelar un pedido ya pagado por completo o entregado' });
    }

    // Entering AWAITING_PAYMENT is when the payment deadline gets set (business rule:
    // 2 days before delivery, or 24h from order creation, whichever is sooner).
    const enteringAwaitingPayment =
      status === OrderStatus.AWAITING_PAYMENT && existingOrder.status !== OrderStatus.AWAITING_PAYMENT;

    // Vestigial now that orders start in AWAITING_PAYMENT — kept for the rare
    // manual status flip back into it. Uses the order's current pickup slot; if a
    // reschedule also changed the slot, reEnqueueOrder below recomputes the times
    // (the deadline stays anchored to the pre-reschedule pickup, close enough).
    const paymentDueDate = enteringAwaitingPayment
      ? computePaymentDueDate(
          (deliveryDate ? new Date(deliveryDate) : existingOrder.deliveryDate).toISOString().slice(0, 10),
          existingOrder.deliveryStartMinutes + existingOrder.deliveryDurationMin
        )
      : undefined;

    const oldDateStr = dateStrOf(existingOrder.deliveryDate);
    const newDateStr = deliveryDate !== undefined ? dateStrOf(new Date(deliveryDate)) : oldDateStr;
    const wasAlreadyCancelled = existingOrder.status === OrderStatus.CANCELLED;
    const isRescheduling = newDateStr !== oldDateStr && !wasAlreadyCancelled;

    // Marking FULLY_PAID always means the whole order is settled — auto-fill
    // depositPaid with the total unless a specific amount was sent explicitly.
    const autoFullDepositPaid =
      status === OrderStatus.FULLY_PAID && depositPaid === undefined ? existingOrder.totalPrice : undefined;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          ...(clientName !== undefined && { clientName }),
          ...(clientPhone !== undefined && { clientPhone }),
          ...(deliveryDate !== undefined && { deliveryDate: new Date(deliveryDate) }),
          ...(deliveryAddress !== undefined && { deliveryAddress }),
          ...(notes !== undefined && { notes }),
          ...(totalPrice !== undefined && { totalPrice }),
          ...(depositPaid !== undefined && { depositPaid }),
          ...(autoFullDepositPaid !== undefined && { depositPaid: autoFullDepositPaid }),
          ...(status !== undefined && { status }),
          ...(paymentDueDate !== undefined && { paymentDueDate }),
        },
      });

      // Moving the order to another day: append it to the new day's queue. The
      // old day's slot is left as a gap (the cursor never moves back) and the
      // pickup time changes — Melosa tells the client over WhatsApp. Cancelling
      // does NOT free the slot, by design.
      if (isRescheduling) {
        await reEnqueueOrder(tx, orderId);
        return tx.order.findUniqueOrThrow({ where: { id: orderId } });
      }
      return updated;
    });

    res.json({
      ...updatedOrder,
      deliveryTimeLabel: minutesToLabel(
        updatedOrder.deliveryStartMinutes + updatedOrder.deliveryDurationMin
      ),
    });
  } catch (error) {
    console.error('Error actualizando pedido:', error);

    if (isNotEnoughRoomError(error)) {
      return res.status(409).json({ error: (error as Error).message });
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
    const existingOrder = await prisma.order.findUnique({ where: { id: orderId } });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    // The order's slot on its day timeline is simply left as a gap — the day
    // cursor never moves back.
    await prisma.order.delete({ where: { id: orderId } });

    res.json({ message: 'Pedido eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando pedido:', error);
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
}
