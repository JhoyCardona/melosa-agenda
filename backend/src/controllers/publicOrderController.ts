import { Request, Response } from 'express';
import { PrismaClient, Flavor, OrderStatus } from '@prisma/client';
import { isBusinessDay } from '../utils/colombianHolidays';
import { computePaymentDueDate, earliestPublicDeliveryDate } from '../utils/colombiaTime';
import { reserveDeliverySlot, minutesToLabel, isNotEnoughRoomError } from '../services/availability';
import cloudinary from '../config/cloudinary';

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

const VALID_FLAVORS = Object.values(Flavor);

interface PublicOrderItemInput {
  productDesignId: string;
  variantId: string;
  flavor: Flavor;
  customImageUrl?: string;
  customText?: string;
}

// Public, no-auth endpoint clients use to book their own order from the web form.
// Always lands as PENDING_REVIEW/WEB_PUBLIC — Melosa still reviews and approves it
// manually before it moves to AWAITING_PAYMENT.
export async function createPublicOrder(req: Request, res: Response) {
  const { clientName, clientPhone, deliveryDate, deliveryAddress, notes, items } = req.body;

  if (!clientName || !clientPhone || !deliveryDate) {
    return res.status(400).json({
      error: 'clientName, clientPhone y deliveryDate son requeridos',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items debe ser un arreglo con al menos un producto' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    return res.status(400).json({ error: 'deliveryDate debe tener el formato YYYY-MM-DD' });
  }

  // 48h booking cutoff (also enforced by the form's date picker; re-checked here
  // because the endpoint is public). Catches past dates too, since `earliest` is
  // always today (Colombia) + 2 days.
  const earliest = earliestPublicDeliveryDate();
  if (deliveryDate < earliest) {
    return res.status(400).json({
      error: `Necesitamos al menos 48 horas de anticipación. Elige una fecha a partir del ${earliest}.`,
    });
  }

  if (!isBusinessDay(deliveryDate)) {
    return res.status(400).json({ error: 'No se agenda ese día (domingo o festivo)' });
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
    const variantIds = (items as PublicOrderItemInput[]).map((item) => item.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    for (const item of items as PublicOrderItemInput[]) {
      const variant = variantById.get(item.variantId);
      if (!variant || variant.productDesignId !== item.productDesignId) {
        return res.status(404).json({ error: 'Uno de los productos seleccionados no existe' });
      }
      if (!item.flavor || !VALID_FLAVORS.includes(item.flavor)) {
        return res.status(400).json({ error: `flavor debe ser uno de: ${VALID_FLAVORS.join(', ')}` });
      }
    }

    const totalPrice = (items as PublicOrderItemInput[]).reduce(
      (sum, item) => sum + Number(variantById.get(item.variantId)!.price),
      0
    );
    const rawDurationMin = (items as PublicOrderItemInput[]).reduce(
      (sum, item) => sum + variantById.get(item.variantId)!.prepMinutes,
      0
    );

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
          clientName,
          clientPhone: normalizedPhone,
          deliveryDate: new Date(deliveryDate),
          deliveryStartMinutes: slot.startMinutes,
          deliveryDurationMin: slot.durationMin,
          deliveryAddress: deliveryAddress || null,
          notes: notes || null,
          source: 'WEB_PUBLIC',
          status: OrderStatus.AWAITING_PAYMENT,
          paymentDueDate: computePaymentDueDate(deliveryDate, pickupMinutes),
          totalPrice,
          items: {
            create: (items as PublicOrderItemInput[]).map((item) => {
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
        include: { items: true },
      });
    });

    res.status(201).json({
      ...order,
      deliveryTimeLabel: minutesToLabel(order.deliveryStartMinutes + order.deliveryDurationMin),
    });
  } catch (error) {
    console.error('Error creando pedido público:', error);

    // "Day is full" is the only expected failure mode here — surface it as 409.
    if (isNotEnoughRoomError(error)) {
      return res.status(409).json({ error: (error as Error).message });
    }

    res.status(500).json({ error: 'Error al crear el pedido' });
  }
}
