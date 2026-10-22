import { PrismaClient, Prisma, Flavor, ItemCategory, PrintImageType } from '@prisma/client';
import {
  rellenoSurcharge,
  isValidRelleno,
  isValidMinicakeRelleno,
  DEFAULT_MINICAKE_RELLENO,
} from './pricing';
import { resolveCakeLines, isCakeLineInput, CakeLineError, PRINT_IMAGE_PRICES, type CakeLineInput } from './cakeCatalog';

// Validation + pricing of the product lines a client posts from the web — shared
// by booking a new order (createPublicOrder) and modifying one from the private
// link (orderManageController), so both accept and charge exactly the same.

const prisma = new PrismaClient();

const VALID_FLAVORS = Object.values(Flavor);
// Shape is a client pick at add-to-cart time (color-picker rework), not a fixed
// ProductDesign field — "Redonda" is the default the form preselects.
const VALID_SHAPES = ['Redonda', 'Corazón'];

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

// A message meant for the client, with the HTTP status to answer it with.
export class PublicOrderInputError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface ResolvedPublicLine {
  price: number;
  prepMinutes: number;
  fullPaymentIfAlone: boolean;
  itemData: Omit<Prisma.OrderItemCreateWithoutOrderInput, 'productDesign' | 'variant'> & {
    productDesignId: string;
    variantId: string | null;
  };
}

// Throws PublicOrderInputError on the first bad line.
export async function resolvePublicLines(items: unknown[]): Promise<ResolvedPublicLine[]> {
  const legacyItems: PublicOrderItemInput[] = [];
  const cakeItems: CakeLineInput[] = [];
  for (const item of items) {
    const variantId = (item as { variantId?: unknown } | null)?.variantId;
    if (typeof variantId === 'string' && variantId) legacyItems.push(item as PublicOrderItemInput);
    else if (isCakeLineInput(item)) cakeItems.push(item);
    else throw new PublicOrderInputError(400, 'Uno de los productos del pedido está incompleto');
  }

  const [variants, designs] = await Promise.all([
    prisma.productVariant.findMany({ where: { id: { in: legacyItems.map((i) => i.variantId) } } }),
    prisma.productDesign.findMany({
      where: { id: { in: legacyItems.map((i) => i.productDesignId) } },
      include: { images: true },
    }),
  ]);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const designById = new Map(designs.map((d) => [d.id, d]));

  const legacyLines: ResolvedPublicLine[] = legacyItems.map((item) => {
    const variant = variantById.get(item.variantId);
    const design = variant ? designById.get(item.productDesignId) : undefined;
    if (!variant || !design || variant.productDesignId !== item.productDesignId) {
      throw new PublicOrderInputError(404, 'Uno de los productos seleccionados no existe');
    }

    // effectiveRelleno/effectiveShape are decided here, not fully trusted from
    // the client: a promo (minicake) variant picks from RELLENOS_MINICAKE
    // (defaulting to Arequipe when nothing is sent), every size of the alfajor
    // minicake is always Arequipe (its filling never changes), and an
    // empty/unknown shape falls back to "Redonda" (the form's own default).
    const isAlfajor = design.category === ItemCategory.ALFAJOR_CAKE;
    const posted = item.relleno?.trim() || '';
    const effectiveRelleno = isAlfajor
      ? DEFAULT_MINICAKE_RELLENO
      : variant.enPromocion
        ? posted || DEFAULT_MINICAKE_RELLENO
        : posted;
    const effectiveShape = item.shape?.trim() || 'Redonda';
    const effectiveColor = item.color?.trim() || undefined;
    // A variant with maxCustomImages > 1 (the memory cake and similar) uses
    // customImageUrls; the ordinary single-image case ignores it entirely.
    const multiImage = variant.maxCustomImages > 1;
    const effectiveImages = multiImage
      ? (item.customImageUrls ?? []).filter((url) => typeof url === 'string' && url.trim())
      : item.customImageUrl
        ? [item.customImageUrl]
        : [];

    if (!item.flavor || !VALID_FLAVORS.includes(item.flavor)) {
      throw new PublicOrderInputError(400, `flavor debe ser uno de: ${VALID_FLAVORS.join(', ')}`);
    }
    if (!effectiveRelleno) {
      throw new PublicOrderInputError(400, 'relleno es requerido');
    }
    const isMinicake = variant.enPromocion && !isAlfajor;
    if (!(isMinicake ? isValidMinicakeRelleno(effectiveRelleno) : isValidRelleno(effectiveRelleno))) {
      throw new PublicOrderInputError(400, `relleno no reconocido: "${effectiveRelleno}"`);
    }
    if (!VALID_SHAPES.includes(effectiveShape)) {
      throw new PublicOrderInputError(400, `shape debe ser uno de: ${VALID_SHAPES.join(', ')}`);
    }
    if (effectiveColor && design.images.length > 0 && !design.images.some((img) => img.colorName === effectiveColor)) {
      throw new PublicOrderInputError(400, `color no reconocido para ese diseño: "${effectiveColor}"`);
    }
    if (design.requiresCustomImage && effectiveImages.length === 0) {
      throw new PublicOrderInputError(400, 'Este diseño necesita que subas una imagen para imprimir.');
    }
    if (multiImage && effectiveImages.length > variant.maxCustomImages) {
      throw new PublicOrderInputError(400, `Este tamaño admite hasta ${variant.maxCustomImages} imágenes.`);
    }
    const maxTextLength = design.customTextMaxLength ?? 20;
    if ((item.customText?.trim().length ?? 0) > maxTextLength) {
      throw new PublicOrderInputError(400, `El texto personalizado no puede pasar de ${maxTextLength} letras.`);
    }

    // Honour the design's flags even if the client posts these fields directly
    // (the form already hides the inputs when not allowed).
    const imagesAllowed = design.allowsCustomImage;
    // Same per-cake print surcharge as catalog v2 cakes: non-edible unless the
    // client picked edible, and nothing when there's no (allowed) image.
    const printImageType =
      imagesAllowed && effectiveImages.length > 0
        ? item.printImageType === PrintImageType.EDIBLE
          ? PrintImageType.EDIBLE
          : PrintImageType.NON_EDIBLE
        : null;
    const price =
      Number(variant.price) +
      rellenoSurcharge(effectiveRelleno, variant.portions, variant.enPromocion) +
      (printImageType ? PRINT_IMAGE_PRICES[printImageType] : 0);

    return {
      price,
      prepMinutes: variant.prepMinutes,
      fullPaymentIfAlone: variant.enPromocion,
      itemData: {
        productDesignId: item.productDesignId,
        variantId: item.variantId,
        priceAtOrder: price,
        pointsAtOrder: variant.points,
        flavor: item.flavor,
        shape: effectiveShape,
        color: effectiveColor ?? null,
        relleno: effectiveRelleno,
        customImageUrl: imagesAllowed && !multiImage ? effectiveImages[0] ?? null : null,
        customImageUrls: imagesAllowed && multiImage ? effectiveImages : [],
        printImageType,
        customText: design.allowsCustomText ? item.customText?.trim() || null : null,
      },
    };
  });

  // Catalog v2 cakes: validated and priced from the live catalog.
  let cakeLines;
  try {
    cakeLines = await resolveCakeLines(cakeItems);
  } catch (error) {
    if (error instanceof CakeLineError) throw new PublicOrderInputError(400, error.message);
    throw error;
  }

  return [...legacyLines, ...cakeLines];
}
