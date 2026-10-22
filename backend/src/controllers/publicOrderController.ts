import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { PrismaClient, OrderStatus } from '@prisma/client';
import { isBusinessDay } from '../utils/colombianHolidays';
import { computePaymentDueDate, earliestPublicDeliveryDate, isValidIsoDate } from '../utils/colombiaTime';
import { reserveDeliverySlot, minutesToLabel, isNotEnoughRoomError, isDateBlocked } from '../services/availability';
import { computeRequiredPaymentPercent } from '../services/pricing';
import { MAX_CLIENT_NAME_LENGTH, MAX_ADDRESS_LENGTH, MAX_ITEMS_PER_PUBLIC_ORDER } from '../services/limits';
import cloudinary from '../config/cloudinary';
import { resolvePublicLines, PublicOrderInputError } from '../services/publicOrderLines';

const prisma = new PrismaClient();

// Public, no-auth image upload for the web booking form — only reachable for a
// ProductDesign that has allowsCustomImage set (checked here, not just in the UI,
// since anyone can call the endpoint directly).
export async function uploadPublicImage(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: 'No se envió ninguna imagen' });
  }

  const { productDesignId } = req.body;
  if (!productDesignId) {
    return res.status(400).json({ error: 'productDesignId es requerido' });
  }

  try {
    const design = await prisma.productDesign.findUnique({ where: { id: productDesignId } });
    if (!design || !design.allowsCustomImage) {
      return res.status(400).json({ error: 'Ese producto no admite imagen personalizada' });
    }

    const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'melosa-agenda/pedidos-web',
      transformation: [
        { width: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' },
      ],
    });

    res.status(201).json({ imageUrl: result.secure_url });
  } catch (error) {
    console.error('Error subiendo imagen pública:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
}

// Secret for the client's private "modificar mi pedido" link: 144 random bits,
// URL-safe. Unguessable, unlike the sequential ticket number.
export function newAccessToken(): string {
  return randomBytes(18).toString('base64url');
}

// Public, no-auth endpoint clients use to book their own order from the web form.
// Lands as AWAITING_PAYMENT/WEB_PUBLIC with its payment deadline already set.
// Web orders carry no free-text notes (Oct 2026 decision: the client books the
// cake as shown, no extra specifications) — a posted `notes` is ignored.
export async function createPublicOrder(req: Request, res: Response) {
  const { clientName, clientPhone, deliveryDate, deliveryAddress, items } = req.body;

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
  if (deliveryAddress && String(deliveryAddress).trim().length > MAX_ADDRESS_LENGTH) {
    return res.status(400).json({
      error: `La dirección no puede pasar de ${MAX_ADDRESS_LENGTH} caracteres.`,
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items debe ser un arreglo con al menos un producto' });
  }

  if (items.length > MAX_ITEMS_PER_PUBLIC_ORDER) {
    return res.status(400).json({
      error: `Un pedido web admite hasta ${MAX_ITEMS_PER_PUBLIC_ORDER} productos. Para más, escríbenos por WhatsApp.`,
    });
  }

  if (!isValidIsoDate(deliveryDate)) {
    return res.status(400).json({ error: 'deliveryDate debe ser una fecha válida con formato YYYY-MM-DD' });
  }

  // 48h booking cutoff (also enforced by the form's date picker; re-checked here
  // because the endpoint is public). Catches past dates too, since `earliest` is
  // always today (Colombia) + 2 days.
  const earliest = earliestPublicDeliveryDate();
  if (deliveryDate < earliest) {
    return res.status(400).json({
      error: `Necesitamos al menos 2 días de anticipación. Elige una fecha a partir del ${earliest}.`,
    });
  }

  if (!isBusinessDay(deliveryDate)) {
    return res.status(400).json({ error: 'No se agenda ese día (domingo, lunes o festivo)' });
  }

  if (await isDateBlocked(deliveryDate)) {
    return res.status(400).json({ error: 'Ese día no está disponible. Elige otra fecha.' });
  }

  // Accept any international number — clients on holiday book from foreign lines.
  // Only strip formatting; require enough digits to be a real number.
  const normalizedPhone = String(clientPhone).replace(/[^\d+]/g, '');
  if (normalizedPhone.replace(/\D/g, '').length < 7) {
    return res.status(400).json({
      error: 'El teléfono no parece válido. Escríbelo con el indicativo del país si es del exterior.',
    });
  }

  try {
    const lines = await resolvePublicLines(items);
    const totalPrice = lines.reduce((sum, l) => sum + l.price, 0);
    const rawDurationMin = lines.reduce((sum, l) => sum + l.prepMinutes, 0);
    // Exactly one item whose size asks for full payment alone (a minicake) ->
    // 100%; everything else -> 50%.
    const requiredPaymentPercent = computeRequiredPaymentPercent(lines);

    const order = await prisma.$transaction(async (tx) => {
      // Assigns the pickup slot and advances the day cursor, all-or-nothing with
      // the order create. Throws (rolling back) if the day is already full.
      const slot = await reserveDeliverySlot(tx, deliveryDate, rawDurationMin);

      // Every order enters AWAITING_PAYMENT right away: the payment deadline
      // (pickup time - 24h) starts counting from creation. It's excluded from the
      // "resumen para hornear" until Melosa marks a payment.
      const pickupMinutes = slot.startMinutes + slot.durationMin;

      return tx.order.create({
        data: {
          clientName: String(clientName).trim(),
          clientPhone: normalizedPhone,
          deliveryDate: new Date(deliveryDate),
          deliveryStartMinutes: slot.startMinutes,
          deliveryDurationMin: slot.durationMin,
          deliveryAddress: deliveryAddress ? String(deliveryAddress).trim() : null,
          source: 'WEB_PUBLIC',
          status: OrderStatus.AWAITING_PAYMENT,
          paymentDueDate: computePaymentDueDate(deliveryDate, pickupMinutes),
          requiredPaymentPercent,
          totalPrice,
          accessToken: newAccessToken(),
          items: { create: lines.map((l) => l.itemData) },
        },
        include: { items: true },
      });
    });

    res.status(201).json({
      ...order,
      deliveryTimeLabel: minutesToLabel(order.deliveryStartMinutes + order.deliveryDurationMin),
    });
  } catch (error) {
    if (error instanceof PublicOrderInputError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creando pedido público:', error);

    // "Day is full" is the only expected failure mode here — surface it as 409.
    if (isNotEnoughRoomError(error)) {
      return res.status(409).json({ error: (error as Error).message });
    }

    res.status(500).json({ error: 'Error al crear el pedido' });
  }
}
