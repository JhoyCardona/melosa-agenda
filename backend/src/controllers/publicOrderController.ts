import { Request, Response } from 'express';
import { PrismaClient, TimeBlock, Flavor } from '@prisma/client';
import { isBusinessDay } from '../utils/colombianHolidays';
import { reserveSlotPoints } from '../services/availability';

const prisma = new PrismaClient();

const VALID_TIME_BLOCKS = Object.values(TimeBlock);
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
  const { clientName, clientPhone, deliveryDate, timeBlock, deliveryAddress, notes, items } = req.body;

  if (!clientName || !clientPhone || !deliveryDate || !timeBlock) {
    return res.status(400).json({
      error: 'clientName, clientPhone, deliveryDate y timeBlock son requeridos',
    });
  }

  if (!VALID_TIME_BLOCKS.includes(timeBlock)) {
    return res.status(400).json({ error: `timeBlock debe ser uno de: ${VALID_TIME_BLOCKS.join(', ')}` });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items debe ser un arreglo con al menos un producto' });
  }

  if (!isBusinessDay(deliveryDate)) {
    return res.status(400).json({ error: 'No se agenda ese día (domingo o festivo)' });
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

    const totalPoints = (items as PublicOrderItemInput[]).reduce(
      (sum, item) => sum + variantById.get(item.variantId)!.points,
      0
    );
    const totalPrice = (items as PublicOrderItemInput[]).reduce(
      (sum, item) => sum + Number(variantById.get(item.variantId)!.price),
      0
    );

    const order = await prisma.$transaction(async (tx) => {
      // Throws if the block doesn't have enough free points, rolling back the whole
      // transaction — no order/points get created if the slot filled up meanwhile.
      await reserveSlotPoints(tx, deliveryDate, timeBlock, totalPoints);

      return tx.order.create({
        data: {
          clientName,
          clientPhone,
          deliveryDate: new Date(deliveryDate),
          timeBlock,
          deliveryAddress: deliveryAddress || null,
          notes: notes || null,
          source: 'WEB_PUBLIC',
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

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creando pedido público:', error);

    // reserveSlotPoints throws a plain Error for "not enough capacity" — that's the
    // only expected failure mode here, so it's the only one we surface to the client.
    if (error instanceof Error && error.message.includes('no tiene suficiente disponibilidad')) {
      return res.status(409).json({ error: error.message });
    }

    res.status(500).json({ error: 'Error al crear el pedido' });
  }
}
