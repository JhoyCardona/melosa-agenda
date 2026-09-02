import { Response } from 'express';
import { PrismaClient, Prisma, OrderStatus, OrderSource, Flavor, ItemCategory } from '@prisma/client';
import archiver from 'archiver';
import { AuthRequest } from '../middleware/authMiddleware';
import { computePaymentDueDate } from '../utils/colombiaTime';
import { reserveDeliverySlot, minutesToLabel, isNotEnoughRoomError } from '../services/availability';
import { rellenoSurcharge, computeRequiredPaymentPercent, isValidRelleno } from '../services/pricing';
import { MAX_CLIENT_NAME_LENGTH, MAX_NOTES_LENGTH, MAX_ADDRESS_LENGTH } from '../services/limits';

const prisma = new PrismaClient();

const VALID_STATUSES = Object.values(OrderStatus);
const VALID_FLAVORS = Object.values(Flavor);
const VALID_SOURCES = Object.values(OrderSource);

function dateStrOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// A line is either a catalog reference (variantId) or a fully custom line
// (customName + priceAtOrder), entered from the web admin order form.
interface OrderItemInput {
  productDesignId?: string;
  variantId?: string;
  flavor?: Flavor;
  relleno?: string;
  customName?: string;
  customFlavor?: string;
  customSize?: string;
  shape?: string;
  priceAtOrder?: number;
  customImageUrl?: string;
  customText?: string;
  // Client's WhatsApp reference photo. Required for cake lines unless the admin
  // ticks "no reference photo" (plain cake, "surprise me"), which sends
  // skipReference: true instead.
  referenceImageUrl?: string;
  skipReference?: boolean;
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

// Manual order creation from the web admin panel (Fase 6b). Two modes:
//  - `deliveryStartMinutes` present → admin free-form: a fixed pickup clock time
//    (minutes from midnight), NO timeline cursor, NO date/day/window validation
//    (trusted channel — personalized orders, family/friends, any date incl. past
//    or Sundays). deliveryDurationMin stays 0.
//  - `deliveryStartMinutes` absent → legacy: append to the day's timeline queue.
// Items can be catalog references (variantId) or fully custom lines (customName +
// priceAtOrder). `depositPaid > 0` creates the order already DEPOSIT_PAID.
export async function createOrder(req: AuthRequest, res: Response) {
  const {
    clientName,
    clientPhone,
    deliveryDate,
    deliveryAddress,
    notes,
    deliveryStartMinutes,
    depositPaid,
    source,
    items,
  } = req.body;

  if (!clientName || !clientPhone || !deliveryDate) {
    return res.status(400).json({
      error: 'clientName, clientPhone y deliveryDate son requeridos',
    });
  }
  if (String(clientName).trim().length > MAX_CLIENT_NAME_LENGTH) {
    return res.status(400).json({
      error: `El nombre no puede pasar de ${MAX_CLIENT_NAME_LENGTH} caracteres.`,
    });
  }
  if (notes && String(notes).trim().length > MAX_NOTES_LENGTH) {
    return res.status(400).json({ error: `Las notas no pueden pasar de ${MAX_NOTES_LENGTH} caracteres.` });
  }
  if (deliveryAddress && String(deliveryAddress).trim().length > MAX_ADDRESS_LENGTH) {
    return res.status(400).json({
      error: `La dirección no puede pasar de ${MAX_ADDRESS_LENGTH} caracteres.`,
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return res.status(400).json({ error: 'deliveryDate debe tener el formato YYYY-MM-DD' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items debe ser un arreglo con al menos un producto' });
  }

  const adminFreeform = deliveryStartMinutes !== undefined;
  if (
    adminFreeform &&
    (typeof deliveryStartMinutes !== 'number' ||
      !Number.isInteger(deliveryStartMinutes) ||
      deliveryStartMinutes < 0 ||
      deliveryStartMinutes >= 1440)
  ) {
    return res.status(400).json({ error: 'deliveryStartMinutes debe ser un entero entre 0 y 1439' });
  }
  if (
    depositPaid !== undefined &&
    (typeof depositPaid !== 'number' || Number.isNaN(depositPaid) || depositPaid < 0)
  ) {
    return res.status(400).json({ error: 'depositPaid debe ser un número mayor o igual a 0' });
  }
  if (source !== undefined && !VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `source debe ser una de: ${VALID_SOURCES.join(', ')}` });
  }

  try {
    const wantedVariantIds = (items as OrderItemInput[])
      .map((i) => i.variantId)
      .filter((id): id is string => !!id);
    const variants = await prisma.productVariant.findMany({ where: { id: { in: wantedVariantIds } } });
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const designs = await prisma.productDesign.findMany({
      where: { id: { in: variants.map((v) => v.productDesignId) } },
    });
    const designById = new Map(designs.map((d) => [d.id, d]));

    interface BuiltLine {
      productDesignId: string | null;
      variantId: string | null;
      priceAtOrder: number;
      pointsAtOrder: number;
      prepMinutes: number;
      flavor: Flavor | null;
      customName: string | null;
      customFlavor: string | null;
      customSize: string | null;
      shape: string | null;
      relleno: string | null;
      customImageUrl: string | null;
      customText: string | null;
      referenceImageUrl: string | null;
      isPromoMinicake: boolean;
    }
    const lines: BuiltLine[] = [];

    // A cake line must carry the client's reference photo, unless the admin
    // explicitly waived it (skipReference) for a plain / "surprise me" cake.
    const missingReference = (item: OrderItemInput): boolean =>
      !item.referenceImageUrl && !item.skipReference;

    for (const item of items as OrderItemInput[]) {
      if (item.variantId) {
        const variant = variantById.get(item.variantId);
        if (!variant || (item.productDesignId && variant.productDesignId !== item.productDesignId)) {
          return res.status(404).json({ error: 'Una de las variantes seleccionadas no existe' });
        }
        if (!item.flavor || !VALID_FLAVORS.includes(item.flavor)) {
          return res.status(400).json({ error: `flavor debe ser uno de: ${VALID_FLAVORS.join(', ')}` });
        }
        // A promo (minicake) variant is always Vainilla, regardless of what was posted.
        const effectiveRelleno = variant.enPromocion ? 'Vainilla' : item.relleno?.trim() || '';
        if (!effectiveRelleno) {
          return res.status(400).json({ error: 'relleno es requerido' });
        }
        if (!isValidRelleno(effectiveRelleno)) {
          return res.status(400).json({ error: `relleno no reconocido: "${effectiveRelleno}"` });
        }
        const design = designById.get(variant.productDesignId);
        if (design?.category === ItemCategory.CAKE && missingReference(item)) {
          return res.status(400).json({
            error: 'Falta la foto de referencia de la torta (o marca "sin foto de referencia").',
          });
        }
        lines.push({
          productDesignId: variant.productDesignId,
          variantId: variant.id,
          priceAtOrder:
            Number(variant.price) + rellenoSurcharge(effectiveRelleno, variant.portions, variant.enPromocion),
          pointsAtOrder: variant.points,
          prepMinutes: variant.prepMinutes,
          flavor: item.flavor,
          customName: null,
          customFlavor: null,
          customSize: null,
          shape: design?.shape ?? null,
          relleno: effectiveRelleno,
          customImageUrl: item.customImageUrl || null,
          customText: item.customText || null,
          referenceImageUrl: item.referenceImageUrl || null,
          isPromoMinicake: !!variant.enPromocion,
        });
      } else {
        if (!item.customName || !String(item.customName).trim()) {
          return res.status(400).json({ error: 'Cada línea libre necesita una descripción (customName)' });
        }
        if (
          typeof item.priceAtOrder !== 'number' ||
          Number.isNaN(item.priceAtOrder) ||
          item.priceAtOrder < 0
        ) {
          return res.status(400).json({ error: 'Cada línea libre necesita un precio (priceAtOrder) >= 0' });
        }
        if (!item.customFlavor || !String(item.customFlavor).trim()) {
          return res.status(400).json({ error: 'Cada línea libre necesita un sabor de torta (customFlavor)' });
        }
        if (!item.customSize || !String(item.customSize).trim()) {
          return res.status(400).json({ error: 'Cada línea libre necesita las porciones (customSize)' });
        }
        if (!item.shape || !String(item.shape).trim()) {
          return res.status(400).json({ error: 'Cada línea libre necesita una forma (shape)' });
        }
        if (!item.relleno || !String(item.relleno).trim()) {
          return res.status(400).json({ error: 'Cada línea libre necesita un relleno' });
        }
        // Free lines are always custom cakes → same reference-photo rule.
        if (missingReference(item)) {
          return res.status(400).json({
            error: 'Falta la foto de referencia de la torta (o marca "sin foto de referencia").',
          });
        }
        lines.push({
          productDesignId: null,
          variantId: null,
          priceAtOrder: item.priceAtOrder,
          pointsAtOrder: 0,
          prepMinutes: 0,
          flavor: null,
          customName: String(item.customName).trim(),
          customFlavor: String(item.customFlavor).trim(),
          customSize: String(item.customSize).trim(),
          shape: String(item.shape).trim(),
          relleno: String(item.relleno).trim(),
          customImageUrl: item.customImageUrl || null,
          customText: item.customText || null,
          referenceImageUrl: item.referenceImageUrl || null,
          isPromoMinicake: false,
        });
      }
    }

    const totalPrice = lines.reduce((sum, l) => sum + l.priceAtOrder, 0);
    const rawDurationMin = lines.reduce((sum, l) => sum + l.prepMinutes, 0);
    const requiredPaymentPercent = computeRequiredPaymentPercent(
      lines.map((l) => ({ isPromoMinicake: l.isPromoMinicake }))
    );
    const hasDeposit = typeof depositPaid === 'number' && depositPaid > 0;

    const order = await prisma.$transaction(async (tx) => {
      let startMinutes: number;
      let durationMin: number;
      if (adminFreeform) {
        // Fixed pickup time — no cursor, no window check, overlaps allowed.
        startMinutes = deliveryStartMinutes as number;
        durationMin = 0;
      } else {
        const slot = await reserveDeliverySlot(tx, deliveryDate, rawDurationMin);
        startMinutes = slot.startMinutes;
        durationMin = slot.durationMin;
      }
      const pickupMinutes = startMinutes + durationMin;

      return tx.order.create({
        data: {
          clientName,
          clientPhone,
          deliveryDate: new Date(deliveryDate),
          deliveryStartMinutes: startMinutes,
          deliveryDurationMin: durationMin,
          deliveryAddress: deliveryAddress || null,
          notes: notes || null,
          source: source ?? OrderSource.MANUAL,
          requiredPaymentPercent,
          totalPrice,
          ...(hasDeposit
            ? { status: OrderStatus.DEPOSIT_PAID, depositPaid }
            : { paymentDueDate: computePaymentDueDate(deliveryDate, pickupMinutes) }),
          items: {
            create: lines.map((l) => ({
              productDesignId: l.productDesignId,
              variantId: l.variantId,
              priceAtOrder: l.priceAtOrder,
              pointsAtOrder: l.pointsAtOrder,
              flavor: l.flavor,
              customName: l.customName,
              customFlavor: l.customFlavor,
              customSize: l.customSize,
              shape: l.shape,
              relleno: l.relleno,
              customImageUrl: l.customImageUrl,
              customText: l.customText,
              referenceImageUrl: l.referenceImageUrl,
            })),
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
  const { productDesignId, variantId, flavor, customImageUrl, customText, referenceImageUrl } = req.body;

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
          referenceImageUrl: referenceImageUrl || null,
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

      // Date.UTC (not the local-timezone Date constructor) so this range doesn't
      // drift with the server's timezone — deliveryDate values are themselves
      // stored as UTC-midnight calendar dates.
      const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1));
      const endDate = new Date(Date.UTC(yearNum, monthNum, 1));

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

    // Every non-cancelled order counts, paid or not — Melosa wants to see the
    // full baking load for any future day, not just what's already confirmed.
    // Each group also carries unpaidQuantity so the app can flag what's still
    // waiting on payment (full per-order detail still shows "NO PAGÓ" too).
    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: new Date(`${date}T00:00:00.000Z`),
        status: { not: OrderStatus.CANCELLED },
      },
      include: { items: { include: { productDesign: true, variant: true } } },
    });

    const PAID_STATUSES = new Set<OrderStatus>([OrderStatus.DEPOSIT_PAID, OrderStatus.FULLY_PAID, OrderStatus.COMPLETED]);

    // 3 levels: size (variant.label, e.g. "Torta 10 porciones") -> shape
    // (productDesign.shape, e.g. "Corazón") -> flavor (vainilla/chocolate).
    // This is the priority view: it tells Melosa exactly how many of each to
    // bake before she starts decorating pedido por pedido. Custom admin lines
    // (no catalog variant/design) fall back to their hand-typed values.
    interface FlavorGroup { flavor: string; quantity: number; unpaidQuantity: number }
    interface ShapeGroup { shape: string; quantity: number; unpaidQuantity: number; flavors: FlavorGroup[] }
    interface SizeGroup {
      sizeLabel: string;
      sortKey: number;
      quantity: number;
      unpaidQuantity: number;
      shapes: Map<string, ShapeGroup>;
    }

    const sizeGroups = new Map<string, SizeGroup>();

    for (const order of orders) {
      const isUnpaid = !PAID_STATUSES.has(order.status);
      for (const item of order.items) {
        const sizeLabel = item.variant?.label ?? item.customSize ?? item.customName ?? 'Personalizado';
        const shape = item.shape ?? 'Sin forma definida';
        const flavor = item.flavor ?? item.customFlavor ?? 'Sin sabor definido';

        let sizeGroup = sizeGroups.get(sizeLabel);
        if (!sizeGroup) {
          sizeGroup = { sizeLabel, sortKey: item.pointsAtOrder, quantity: 0, unpaidQuantity: 0, shapes: new Map() };
          sizeGroups.set(sizeLabel, sizeGroup);
        }
        sizeGroup.quantity += 1;
        if (isUnpaid) sizeGroup.unpaidQuantity += 1;

        let shapeGroup = sizeGroup.shapes.get(shape);
        if (!shapeGroup) {
          shapeGroup = { shape, quantity: 0, unpaidQuantity: 0, flavors: [] };
          sizeGroup.shapes.set(shape, shapeGroup);
        }
        shapeGroup.quantity += 1;
        if (isUnpaid) shapeGroup.unpaidQuantity += 1;

        const flavorGroup = shapeGroup.flavors.find((f) => f.flavor === flavor);
        if (flavorGroup) {
          flavorGroup.quantity += 1;
          if (isUnpaid) flavorGroup.unpaidQuantity += 1;
        } else {
          shapeGroup.flavors.push({ flavor, quantity: 1, unpaidQuantity: isUnpaid ? 1 : 0 });
        }
      }
    }

    const sizes = Array.from(sizeGroups.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((size) => ({
        sizeLabel: size.sizeLabel,
        quantity: size.quantity,
        unpaidQuantity: size.unpaidQuantity,
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

  if (clientName !== undefined && String(clientName).trim().length > MAX_CLIENT_NAME_LENGTH) {
    return res.status(400).json({
      error: `El nombre no puede pasar de ${MAX_CLIENT_NAME_LENGTH} caracteres.`,
    });
  }
  if (notes && String(notes).trim().length > MAX_NOTES_LENGTH) {
    return res.status(400).json({ error: `Las notas no pueden pasar de ${MAX_NOTES_LENGTH} caracteres.` });
  }
  if (deliveryAddress && String(deliveryAddress).trim().length > MAX_ADDRESS_LENGTH) {
    return res.status(400).json({
      error: `La dirección no puede pasar de ${MAX_ADDRESS_LENGTH} caracteres.`,
    });
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

    // Terminal ("entregado") only makes sense once the full price is confirmed
    // paid — Melosa has to explicitly hit "pago completo" first (checking the
    // ticket herself) before she can close the order out.
    if (status === OrderStatus.COMPLETED && existingOrder.status !== OrderStatus.FULLY_PAID) {
      return res.status(409).json({
        error: 'Antes de dar este pedido por terminado revisa si ya pagó el valor completo.',
      });
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
          ...(clientName !== undefined && { clientName: String(clientName).trim() }),
          ...(clientPhone !== undefined && { clientPhone }),
          ...(deliveryDate !== undefined && { deliveryDate: new Date(deliveryDate) }),
          ...(deliveryAddress !== undefined && { deliveryAddress: deliveryAddress ? String(deliveryAddress).trim() : null }),
          ...(notes !== undefined && { notes: notes ? String(notes).trim() : null }),
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
  const { customImageUrl, customText, referenceImageUrl } = req.body;

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
        ...(referenceImageUrl !== undefined && { referenceImageUrl }),
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
