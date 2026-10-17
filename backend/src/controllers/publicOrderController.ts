import { Request, Response } from 'express';
import { PrismaClient, Flavor, ItemCategory, OrderStatus, PrintImageType } from '@prisma/client';
import { isBusinessDay } from '../utils/colombianHolidays';
import { computePaymentDueDate, earliestPublicDeliveryDate, isValidIsoDate } from '../utils/colombiaTime';
import { reserveDeliverySlot, minutesToLabel, isNotEnoughRoomError, isDateBlocked } from '../services/availability';
import {
  rellenoSurcharge,
  computeRequiredPaymentPercent,
  isValidRelleno,
  isValidMinicakeRelleno,
  DEFAULT_MINICAKE_RELLENO,
} from '../services/pricing';
import { MAX_CLIENT_NAME_LENGTH, MAX_ADDRESS_LENGTH } from '../services/limits';
import cloudinary from '../config/cloudinary';
import {
  resolveCakeLines,
  isCakeLineInput,
  CakeLineError,
  PRINT_IMAGE_PRICES,
  type CakeLineInput,
} from '../services/cakeCatalog';

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
// Shape is now a client pick at add-to-cart time (color-picker rework), not a
// fixed ProductDesign field — "Redonda" is the default the form preselects.
const VALID_SHAPES = ['Redonda', 'Corazón'];
// A self-service web order bigger than this should go through WhatsApp / the admin
// panel instead — also caps spam and "one order eats half the day" cases.
const MAX_ITEMS_PER_PUBLIC_ORDER = 12;

// A legacy-catalog line (the alfajor minicake, and the pre-v2 cake catalog).
// Catalog v2 cake lines use CakeLineInput instead (colorId/sizeId/... ids, no
// variantId) — told apart by the presence of variantId.
interface PublicOrderItemInput {
  productDesignId: string;
  variantId: string;
  flavor: Flavor;
  relleno: string;
  customImageUrl?: string;
  // Only used for a variant with maxCustomImages > 1 (the memory cake and
  // similar) — customImageUrl alone covers the ordinary case.
  customImageUrls?: string[];
  customText?: string;
  shape?: string;
  color?: string;
  printImageType?: string;
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

  const legacyItems: PublicOrderItemInput[] = [];
  const cakeItems: CakeLineInput[] = [];
  for (const item of items as unknown[]) {
    const variantId = (item as { variantId?: unknown } | null)?.variantId;
    if (typeof variantId === 'string' && variantId) legacyItems.push(item as PublicOrderItemInput);
    else if (isCakeLineInput(item)) cakeItems.push(item);
    else return res.status(400).json({ error: 'Uno de los productos del pedido está incompleto' });
  }

  try {
    const variantIds = legacyItems.map((item) => item.variantId);
    const designIds = legacyItems.map((item) => item.productDesignId);
    const [variants, designs] = await Promise.all([
      prisma.productVariant.findMany({ where: { id: { in: variantIds } } }),
      prisma.productDesign.findMany({ where: { id: { in: designIds } }, include: { images: true } }),
    ]);
    const variantById = new Map(variants.map((v) => [v.id, v]));
    const designById = new Map(designs.map((d) => [d.id, d]));

    // effectiveRelleno/effectiveShape are decided here, not fully trusted from
    // the client: a promo (minicake) variant picks from RELLENOS_MINICAKE
    // (defaulting to Arequipe when nothing is sent), every size of the alfajor
    // minicake is always Arequipe (its filling never changes), and an
    // empty/unknown shape falls back to "Redonda" (the form's own default).
    const resolvedItems = legacyItems.map((item) => {
      const variant = variantById.get(item.variantId);
      const design = variant ? designById.get(item.productDesignId) : undefined;
      const isAlfajor = design?.category === ItemCategory.ALFAJOR_CAKE;
      const posted = item.relleno?.trim() || '';
      const effectiveRelleno = isAlfajor
        ? DEFAULT_MINICAKE_RELLENO
        : variant?.enPromocion
          ? posted || DEFAULT_MINICAKE_RELLENO
          : posted;
      const effectiveShape = item.shape?.trim() || 'Redonda';
      const effectiveColor = item.color?.trim() || undefined;
      // A variant with maxCustomImages > 1 (the memory cake and similar) uses
      // customImageUrls; the ordinary single-image case ignores it entirely.
      const multiImage = (variant?.maxCustomImages ?? 1) > 1;
      const effectiveImages = multiImage
        ? (item.customImageUrls ?? []).filter((url) => typeof url === 'string' && url.trim())
        : item.customImageUrl
          ? [item.customImageUrl]
          : [];
      // Same per-cake print surcharge as catalog v2 cakes: non-edible unless
      // the client picked edible, and nothing when there's no (allowed) image.
      const printImageType =
        design?.allowsCustomImage && effectiveImages.length > 0
          ? item.printImageType === PrintImageType.EDIBLE
            ? PrintImageType.EDIBLE
            : PrintImageType.NON_EDIBLE
          : null;
      const linePrice = variant
        ? Number(variant.price) +
          rellenoSurcharge(effectiveRelleno, variant.portions, variant.enPromocion) +
          (printImageType ? PRINT_IMAGE_PRICES[printImageType] : 0)
        : 0;
      return {
        item,
        variant,
        design,
        effectiveRelleno,
        effectiveShape,
        effectiveColor,
        multiImage,
        effectiveImages,
        printImageType,
        linePrice,
      };
    });

    for (const {
      item,
      variant,
      design,
      effectiveRelleno,
      effectiveShape,
      effectiveColor,
      multiImage,
      effectiveImages,
    } of resolvedItems) {
      if (!variant || variant.productDesignId !== item.productDesignId) {
        return res.status(404).json({ error: 'Uno de los productos seleccionados no existe' });
      }
      if (!item.flavor || !VALID_FLAVORS.includes(item.flavor)) {
        return res.status(400).json({ error: `flavor debe ser uno de: ${VALID_FLAVORS.join(', ')}` });
      }
      if (!effectiveRelleno) {
        return res.status(400).json({ error: 'relleno es requerido' });
      }
      const isMinicake = variant.enPromocion && design?.category !== ItemCategory.ALFAJOR_CAKE;
      if (!(isMinicake ? isValidMinicakeRelleno(effectiveRelleno) : isValidRelleno(effectiveRelleno))) {
        return res.status(400).json({ error: `relleno no reconocido: "${effectiveRelleno}"` });
      }
      if (!VALID_SHAPES.includes(effectiveShape)) {
        return res.status(400).json({ error: `shape debe ser uno de: ${VALID_SHAPES.join(', ')}` });
      }
      if (effectiveColor && design && design.images.length > 0) {
        const knownColor = design.images.some((img) => img.colorName === effectiveColor);
        if (!knownColor) {
          return res.status(400).json({ error: `color no reconocido para ese diseño: "${effectiveColor}"` });
        }
      }
      if (design?.requiresCustomImage && effectiveImages.length === 0) {
        return res.status(400).json({
          error: 'Este diseño necesita que subas una imagen para imprimir.',
        });
      }
      if (multiImage && variant && effectiveImages.length > variant.maxCustomImages) {
        return res.status(400).json({
          error: `Este tamaño admite hasta ${variant.maxCustomImages} imágenes.`,
        });
      }
      const maxTextLength = design?.customTextMaxLength ?? 20;
      if ((item.customText?.trim().length ?? 0) > maxTextLength) {
        return res.status(400).json({
          error: `El texto personalizado no puede pasar de ${maxTextLength} letras.`,
        });
      }
    }

    // Catalog v2 cakes: validated and priced from the live catalog.
    let cakeLines;
    try {
      cakeLines = await resolveCakeLines(cakeItems);
    } catch (error) {
      if (error instanceof CakeLineError) return res.status(400).json({ error: error.message });
      throw error;
    }

    const totalPrice =
      resolvedItems.reduce((sum, { linePrice }) => sum + linePrice, 0) +
      cakeLines.reduce((sum, l) => sum + l.price, 0);
    const rawDurationMin =
      resolvedItems.reduce((sum, { variant }) => sum + variant!.prepMinutes, 0) +
      cakeLines.reduce((sum, l) => sum + l.prepMinutes, 0);
    // Exactly one item whose size asks for full payment alone (a minicake) ->
    // 100%; everything else -> 50%.
    const requiredPaymentPercent = computeRequiredPaymentPercent([
      ...resolvedItems.map(({ variant }) => ({ fullPaymentIfAlone: !!variant!.enPromocion })),
      ...cakeLines.map((l) => ({ fullPaymentIfAlone: l.fullPaymentIfAlone })),
    ]);

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
          items: {
            create: [
              ...resolvedItems.map(
              ({
                item,
                variant,
                design,
                effectiveRelleno,
                effectiveShape,
                effectiveColor,
                multiImage,
                effectiveImages,
                printImageType,
                linePrice,
              }) => {
                // Honour the design's flags even if the client posts these fields
                // directly (the form already hides the inputs when not allowed).
                const imagesAllowed = design!.allowsCustomImage;
                return {
                  productDesignId: item.productDesignId,
                  variantId: item.variantId,
                  priceAtOrder: linePrice,
                  pointsAtOrder: variant!.points,
                  flavor: item.flavor,
                  shape: effectiveShape,
                  color: effectiveColor ?? null,
                  relleno: effectiveRelleno,
                  customImageUrl: imagesAllowed && !multiImage ? effectiveImages[0] ?? null : null,
                  customImageUrls: imagesAllowed && multiImage ? effectiveImages : [],
                  printImageType,
                  customText: design!.allowsCustomText ? item.customText?.trim() || null : null,
                };
              }
              ),
              ...cakeLines.map((l) => l.itemData),
            ],
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
