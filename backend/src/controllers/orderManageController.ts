import { Request, Response } from 'express';
import { PrismaClient, Prisma, OrderStatus, ChangeActor, OrderChangeKind, ItemCategory } from '@prisma/client';
import { isBusinessDay } from '../utils/colombianHolidays';
import { computePaymentDueDate, earliestPublicDeliveryDate, isValidIsoDate } from '../utils/colombiaTime';
import {
  reserveDeliverySlot,
  getDeliveryPreview,
  minutesToLabel,
  isNotEnoughRoomError,
  isDateBlocked,
  ceilToStep,
  CLOSE_MINUTE,
  OPEN_MINUTE,
} from '../services/availability';
import { computeRequiredPaymentPercent } from '../services/pricing';
import { resolvePublicLines, PublicOrderInputError, type ResolvedPublicLine } from '../services/publicOrderLines';
import { MAX_ITEMS_PER_PUBLIC_ORDER } from '../services/limits';

// A client managing their own order from the private link in their WhatsApp
// message ("modificar mi pedido"). Every request carries the link's token PLUS
// the phone and ticket number — the token alone never opens an order.
//
// Rules (agreed Oct 2026):
// - Only while the order is still in play (unpaid, deposit or fully paid) and its
//   current AND new delivery date are both >= today + 2 days (the booking cutoff).
// - Name and phone can never change.
// - Keeping the date: the order keeps its place if it got no longer; otherwise it
//   goes to the end of that day's queue, and if that runs past closing it is
//   pinned to closing time (overlap accepted). Moving to another date: that day
//   needs room, like any new booking.
// - Money is never refunded: a lower total, or cancelling with money paid,
//   becomes saldo a favor (ClientCredit) that gretica applies by hand later.

const prisma = new PrismaClient();
const TX_OPTIONS = { timeout: 15000 };

const MANAGEABLE_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.DEPOSIT_PAID,
  OrderStatus.FULLY_PAID,
];

const ORDER_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: { productDesign: { include: { images: true } }, variant: true },
  },
} satisfies Prisma.OrderInclude;
type ManagedOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

const NOT_FOUND = 'No encontramos un pedido con esos datos. Revisa el teléfono y el número de ticket.';

function digits(phone: unknown): string {
  return String(phone ?? '').replace(/\D/g, '');
}

// The phone typed now vs. the one saved at booking. Tolerates the country code
// being typed one time and not the other (573001234567 vs 3001234567).
function samePhone(typed: unknown, saved: string): boolean {
  const a = digits(typed);
  const b = digits(saved);
  if (a.length < 7 || b.length < 7) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 10 && long.endsWith(short);
}

// Token + phone + ticket must all match, or it's "not found" — never says which
// of the three was wrong.
async function findManagedOrder(body: Record<string, unknown>): Promise<ManagedOrder | null> {
  const token = typeof body.token === 'string' ? body.token : '';
  const ticket = Number(String(body.ticket ?? '').replace(/\D/g, ''));
  if (!token || !Number.isInteger(ticket) || ticket <= 0) return null;
  const order = await prisma.order.findUnique({ where: { accessToken: token }, include: ORDER_INCLUDE });
  if (!order || order.ticketNumber !== ticket || !samePhone(body.phone, order.clientPhone)) return null;
  return order;
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Why the order can't be managed anymore, or null when it can.
function lockedReason(order: ManagedOrder): string | null {
  if (order.status === OrderStatus.CANCELLED) return 'Este pedido está cancelado.';
  if (order.status === OrderStatus.COMPLETED) return 'Este pedido ya fue entregado.';
  if (order.status === OrderStatus.EXPIRED) {
    return 'Este pedido venció porque no se pagó a tiempo. Escríbenos por WhatsApp.';
  }
  if (!MANAGEABLE_STATUSES.includes(order.status)) return 'Este pedido no se puede modificar. Escríbenos por WhatsApp.';
  if (dateString(order.deliveryDate) < earliestPublicDeliveryDate()) {
    return 'Ya faltan menos de 2 días para la entrega, así que el pedido no se puede modificar ni cancelar desde aquí. Escríbenos por WhatsApp.';
  }
  return null;
}

function pickupMinutes(order: { deliveryStartMinutes: number; deliveryDurationMin: number }): number {
  return order.deliveryStartMinutes + order.deliveryDurationMin;
}

function itemPrepMinutes(item: ManagedOrder['items'][number]): number {
  return item.prepMinutesAtOrder ?? item.variant?.prepMinutes ?? 0;
}

// What the client sees of their order. Ids let the web reopen each line in the
// same configurator it was booked with.
function orderView(order: ManagedOrder) {
  return {
    ticketNumber: order.ticketNumber,
    clientName: order.clientName,
    deliveryDate: dateString(order.deliveryDate),
    deliveryTimeLabel: minutesToLabel(pickupMinutes(order)),
    status: order.status,
    totalPrice: Number(order.totalPrice),
    depositPaid: Number(order.depositPaid),
    lockedReason: lockedReason(order),
    items: order.items.map((it) => ({
      id: it.id,
      kind: it.variantId ? 'legacy' : 'cake',
      productDesignId: it.productDesignId,
      variantId: it.variantId,
      designName: it.productDesign?.name ?? it.customName ?? 'Personalizado',
      designImageUrl:
        (it.color && it.productDesign?.images.find((img) => img.colorName === it.color)?.imageUrl) ||
        it.productDesign?.imageUrl ||
        null,
      sizeLabel: it.variant?.label ?? it.customSize,
      color: it.color,
      flavor: it.flavor,
      bizcocho: it.customFlavor,
      relleno: it.relleno,
      shape: it.shape,
      customText: it.customText,
      customImageUrls: it.customImageUrls.length > 0 ? it.customImageUrls : it.customImageUrl ? [it.customImageUrl] : [],
      printImageType: it.printImageType,
      price: Number(it.priceAtOrder),
      prepMinutes: itemPrepMinutes(it),
    })),
  };
}

// Snapshot stored in OrderChange.before/after.
function snapshot(order: ManagedOrder | Omit<ManagedOrder, 'items'>, items: ManagedOrder['items']) {
  return {
    status: order.status,
    deliveryDate: dateString(order.deliveryDate),
    pickup: minutesToLabel(pickupMinutes(order)),
    totalPrice: Number(order.totalPrice),
    depositPaid: Number(order.depositPaid),
    items: items.map((it) => ({
      design: it.productDesign?.name ?? it.customName,
      size: it.variant?.label ?? it.customSize,
      color: it.color,
      flavor: it.flavor ?? it.customFlavor,
      relleno: it.relleno,
      shape: it.shape,
      customText: it.customText,
      images: it.customImageUrls.length > 0 ? it.customImageUrls : it.customImageUrl ? [it.customImageUrl] : [],
      printImageType: it.printImageType,
      price: Number(it.priceAtOrder),
    })),
  };
}

// "100% if it's the only item" for a line the client kept as it was: legacy
// lines read their variant, v2 lines their size (by the label snapshot, within
// the design's product line — cakes and alfajor cakes may share a label).
async function keptFullPaymentFlags(items: ManagedOrder['items']): Promise<boolean[]> {
  const v2Labels = items.filter((it) => !it.variantId && it.customSize).map((it) => it.customSize!);
  const sizes = v2Labels.length
    ? await prisma.cakeSize.findMany({ where: { label: { in: v2Labels } } })
    : [];
  const key = (category: string | undefined, label: string) => `${category ?? ItemCategory.CAKE}:${label}`;
  const fullByLabel = new Map(sizes.map((s) => [key(s.category, s.label), s.requiresFullPayment]));
  return items.map((it) =>
    it.variant
      ? it.variant.enPromocion
      : !!(it.customSize && fullByLabel.get(key(it.productDesign?.category, it.customSize)))
  );
}

interface ModificationPlan {
  newDate: string;
  sameDate: boolean;
  keptItems: ManagedOrder['items'];
  newLines: ResolvedPublicLine[];
  totalPrice: number;
  durationMin: number;
  requiredPaymentPercent: number;
  // Order keeps its current start (same date, not longer than before).
  keepsSlot: boolean;
  startMinutes: number;
  pickupLabel: string;
  depositPaid: number;
  owed: number;
  credit: number;
  status: OrderStatus;
}

// Validates the requested change and works out its consequences, without
// writing anything. The slot here is a preview; the transaction re-reserves it.
async function planModification(order: ManagedOrder, body: Record<string, unknown>): Promise<ModificationPlan> {
  const newDate = body.deliveryDate;
  if (!isValidIsoDate(newDate)) {
    throw new PublicOrderInputError(400, 'Elige una fecha de entrega válida.');
  }
  const sameDate = newDate === dateString(order.deliveryDate);
  if (!sameDate) {
    const earliest = earliestPublicDeliveryDate();
    if (newDate < earliest) {
      throw new PublicOrderInputError(
        400,
        `Necesitamos al menos 2 días de anticipación. Elige una fecha a partir del ${earliest}.`
      );
    }
    if (!isBusinessDay(newDate)) {
      throw new PublicOrderInputError(400, 'No se agenda ese día (domingo, lunes o festivo).');
    }
    if (await isDateBlocked(newDate)) {
      throw new PublicOrderInputError(400, 'Ese día no está disponible. Elige otra fecha.');
    }
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new PublicOrderInputError(400, 'Tu pedido tiene que tener al menos un producto.');
  }
  if (items.length > MAX_ITEMS_PER_PUBLIC_ORDER) {
    throw new PublicOrderInputError(
      400,
      `Un pedido web admite hasta ${MAX_ITEMS_PER_PUBLIC_ORDER} productos. Para más, escríbenos por WhatsApp.`
    );
  }

  // { keepItemId } = this line stays exactly as booked (same price, even if the
  // catalog price changed since). Anything else is a new or edited line.
  const keptIds: string[] = [];
  const newLineInputs: unknown[] = [];
  for (const item of items) {
    const keepId = (item as { keepItemId?: unknown } | null)?.keepItemId;
    if (typeof keepId === 'string') keptIds.push(keepId);
    else newLineInputs.push(item);
  }
  if (new Set(keptIds).size !== keptIds.length) {
    throw new PublicOrderInputError(400, 'Uno de los productos está repetido.');
  }
  const keptItems = order.items.filter((it) => keptIds.includes(it.id));
  if (keptItems.length !== keptIds.length) {
    throw new PublicOrderInputError(400, 'Uno de los productos ya no está en tu pedido. Recarga la página.');
  }
  const newLines = await resolvePublicLines(newLineInputs);

  const totalPrice =
    keptItems.reduce((sum, it) => sum + Number(it.priceAtOrder), 0) + newLines.reduce((sum, l) => sum + l.price, 0);
  const rawDuration =
    keptItems.reduce((sum, it) => sum + itemPrepMinutes(it), 0) + newLines.reduce((sum, l) => sum + l.prepMinutes, 0);
  const durationMin = ceilToStep(rawDuration);
  const requiredPaymentPercent = computeRequiredPaymentPercent([
    ...(await keptFullPaymentFlags(keptItems)).map((fullPaymentIfAlone) => ({ fullPaymentIfAlone })),
    ...newLines,
  ]);

  const keepsSlot = sameDate && durationMin <= order.deliveryDurationMin;
  let startMinutes = order.deliveryStartMinutes;
  if (!keepsSlot) {
    const preview = await getDeliveryPreview(newDate, rawDuration);
    if (sameDate && !preview.fits) {
      // Same rule reserveDeliverySlot applies with capAtClose.
      startMinutes = Math.max(OPEN_MINUTE, CLOSE_MINUTE - durationMin);
    } else if (!preview.fits || preview.deliveryStartMinutes === undefined) {
      throw new PublicOrderInputError(
        409,
        `Ese día ya no tiene espacio para tu pedido (entregamos hasta las ${minutesToLabel(CLOSE_MINUTE)}). Elige otra fecha.`
      );
    } else {
      startMinutes = preview.deliveryStartMinutes;
    }
  }

  // Money already received is never lost: above the new total it becomes credit.
  const paid = Number(order.depositPaid);
  const depositPaid = Math.min(paid, totalPrice);
  const credit = Math.max(0, paid - totalPrice);
  const owed = Math.max(0, totalPrice - paid);
  const status =
    paid <= 0
      ? OrderStatus.AWAITING_PAYMENT
      : owed === 0
        ? OrderStatus.FULLY_PAID
        : OrderStatus.DEPOSIT_PAID;

  return {
    newDate,
    sameDate,
    keptItems,
    newLines,
    totalPrice,
    durationMin,
    requiredPaymentPercent,
    keepsSlot,
    startMinutes,
    pickupLabel: minutesToLabel(startMinutes + durationMin),
    depositPaid,
    owed,
    credit,
    status,
  };
}

function planView(order: ManagedOrder, plan: ModificationPlan) {
  return {
    deliveryDate: plan.newDate,
    deliveryTimeLabel: plan.pickupLabel,
    previousTimeLabel: minutesToLabel(pickupMinutes(order)),
    previousTotal: Number(order.totalPrice),
    totalPrice: plan.totalPrice,
    paid: Number(order.depositPaid),
    owed: plan.owed,
    credit: plan.credit,
  };
}

// Shared prologue: credentials, then "still manageable".
async function loadForChange(req: Request, res: Response): Promise<ManagedOrder | null> {
  const order = await findManagedOrder(req.body ?? {});
  if (!order) {
    res.status(404).json({ error: NOT_FOUND });
    return null;
  }
  const reason = lockedReason(order);
  if (reason) {
    res.status(409).json({ error: reason });
    return null;
  }
  return order;
}

function sendError(res: Response, error: unknown, logLabel: string) {
  if (error instanceof PublicOrderInputError) return res.status(error.status).json({ error: error.message });
  if (isNotEnoughRoomError(error)) return res.status(409).json({ error: (error as Error).message });
  console.error(logLabel, error);
  return res.status(500).json({ error: 'Algo salió mal. Intenta de nuevo en un momento.' });
}

// POST /public-orders/manage/open — the order behind the link, once the phone
// and ticket check out. Also returned for a locked order, with lockedReason set,
// so the client sees what they booked and why they can't change it.
export async function openManagedOrder(req: Request, res: Response) {
  try {
    const order = await findManagedOrder(req.body ?? {});
    if (!order) return res.status(404).json({ error: NOT_FOUND });
    res.json(orderView(order));
  } catch (error) {
    sendError(res, error, 'Error abriendo pedido del cliente:');
  }
}

// POST /public-orders/manage/preview — new total, pickup time and money
// difference for a proposed change. Writes nothing.
export async function previewOrderChange(req: Request, res: Response) {
  try {
    const order = await loadForChange(req, res);
    if (!order) return;
    const plan = await planModification(order, req.body);
    res.json(planView(order, plan));
  } catch (error) {
    sendError(res, error, 'Error previsualizando cambio del cliente:');
  }
}

// POST /public-orders/manage/modify — applies the change.
export async function modifyManagedOrder(req: Request, res: Response) {
  try {
    const order = await loadForChange(req, res);
    if (!order) return;
    const plan = await planModification(order, req.body);
    const keptIds = plan.keptItems.map((it) => it.id);

    const updated = await prisma.$transaction(async (tx) => {
      let start = order.deliveryStartMinutes;
      let duration = plan.durationMin;
      if (!plan.keepsSlot) {
        const slot = await reserveDeliverySlot(tx, plan.newDate, plan.durationMin, undefined, plan.sameDate);
        start = slot.startMinutes;
        duration = slot.durationMin;
      }

      await tx.orderItem.deleteMany({ where: { orderId: order.id, id: { notIn: keptIds } } });
      const result = await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryDate: new Date(plan.newDate),
          deliveryStartMinutes: start,
          deliveryDurationMin: duration,
          totalPrice: plan.totalPrice,
          depositPaid: plan.depositPaid,
          requiredPaymentPercent: plan.requiredPaymentPercent,
          status: plan.status,
          paymentDueDate: computePaymentDueDate(plan.newDate, start + duration),
          modifiedByClientAt: new Date(),
          items: { create: plan.newLines.map((l) => l.itemData) },
        },
        include: ORDER_INCLUDE,
      });

      await tx.orderChange.create({
        data: {
          orderId: order.id,
          actor: ChangeActor.CLIENT,
          kind: OrderChangeKind.MODIFIED,
          before: snapshot(order, order.items),
          after: snapshot(result, result.items),
        },
      });
      if (plan.credit > 0) {
        await tx.clientCredit.create({
          data: {
            clientPhone: order.clientPhone,
            amount: plan.credit,
            reason: `Saldo a favor: el cliente modificó el pedido #${order.ticketNumber} y el total bajó`,
            orderId: order.id,
          },
        });
      }
      return result;
    }, TX_OPTIONS);

    res.json({ ...orderView(updated), change: planView(order, plan) });
  } catch (error) {
    sendError(res, error, 'Error modificando pedido del cliente:');
  }
}

// POST /public-orders/manage/cancel — needs `acknowledge: true` (the client
// ticked "entiendo que mi abono no será devuelto"). Whatever was paid becomes
// saldo a favor. The time slot stays a gap, like any cancellation.
export async function cancelManagedOrder(req: Request, res: Response) {
  if (req.body?.acknowledge !== true) {
    return res.status(400).json({ error: 'Confirma que entiendes que el abono no se devuelve.' });
  }
  try {
    const order = await loadForChange(req, res);
    if (!order) return;
    const paid = Number(order.depositPaid);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, modifiedByClientAt: new Date() },
        include: ORDER_INCLUDE,
      });
      await tx.orderChange.create({
        data: {
          orderId: order.id,
          actor: ChangeActor.CLIENT,
          kind: OrderChangeKind.CANCELLED,
          before: snapshot(order, order.items),
          after: snapshot(result, result.items),
        },
      });
      if (paid > 0) {
        await tx.clientCredit.create({
          data: {
            clientPhone: order.clientPhone,
            amount: paid,
            reason: `Saldo a favor: el cliente canceló el pedido #${order.ticketNumber}`,
            orderId: order.id,
          },
        });
      }
      return result;
    }, TX_OPTIONS);

    res.json({ ...orderView(updated), credit: paid });
  } catch (error) {
    sendError(res, error, 'Error cancelando pedido del cliente:');
  }
}
