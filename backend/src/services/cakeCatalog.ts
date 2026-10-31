import { PrismaClient, ItemCategory, FlavorKind, PrintImageType, Prisma } from '@prisma/client';

// Catalog v2 (cakes): what the public can book, and the server-side check +
// pricing of one booked cake. Both the public catalog endpoint and the order
// endpoints go through here, so "what's offered" and "what's accepted" can't
// drift apart — and the client's own price is never trusted.

const prisma = new PrismaClient();

// Surcharge (pesos) for adding print image(s) to one cake, by what they're
// printed on. Charged once per cake, however many images that cake carries.
// Served with the public catalog so the booking page shows the same numbers
// the order endpoint charges.
export const PRINT_IMAGE_PRICES: Record<PrintImageType, number> = {
  NON_EDIBLE: 1000,
  EDIBLE: 14000,
};

// Product lines that use the v2 catalog (designs + colors + their own
// sizes/flavors/shapes). Alfajor cakes run on the same machinery as cakes,
// each line with its own settings.
export const CATALOG_LINES = [ItemCategory.CAKE, ItemCategory.ALFAJOR_CAKE] as const;
export type CatalogLine = (typeof CATALOG_LINES)[number];

// Reads a product line from a query/body value. Missing = CAKE, so callers
// that predate alfajor (installed web, old links) keep getting cakes only.
export function parseCatalogLine(v: unknown): CatalogLine | null {
  if (v === undefined) return ItemCategory.CAKE;
  return CATALOG_LINES.find((l) => l === v) ?? null;
}

// v2 designs: a v2 product line, not archived, and no legacy ProductVariant rows.
export const V2_DESIGN_WHERE: Prisma.ProductDesignWhereInput = {
  category: { in: [...CATALOG_LINES] },
  archivedAt: null,
  variants: { none: {} },
};

const CATALOG_INCLUDE = {
  imageLimits: true,
  images: {
    orderBy: { createdAt: 'asc' },
    include: {
      allowedFlavors: true,
      allowedShapes: true,
      sizePrices: { include: { size: true } },
    },
  },
} satisfies Prisma.ProductDesignInclude;

type CatalogDesign = Prisma.ProductDesignGetPayload<{ include: typeof CATALOG_INCLUDE }>;
type CatalogColor = CatalogDesign['images'][number];

// The bookable part of one color: only globally active sizes/flavors/shapes.
function bookableParts(color: CatalogColor) {
  const sizes = color.sizePrices
    .filter((p) => p.size.active)
    .sort((a, b) => a.size.portions - b.size.portions);
  const bizcochos = color.allowedFlavors.filter((f) => f.active && f.kind === FlavorKind.BIZCOCHO);
  const rellenos = color.allowedFlavors.filter((f) => f.active && f.kind === FlavorKind.RELLENO);
  const shapes = color.allowedShapes.filter((s) => s.active);
  const complete = sizes.length > 0 && bizcochos.length > 0 && rellenos.length > 0 && shapes.length > 0;
  return { sizes, bizcochos, rellenos, shapes, complete };
}

// Public cake catalog: every v2 design with at least one complete color. An
// incomplete color (no active size, bizcocho, relleno or shape) is left out
// entirely, so the booking page never offers something the order endpoint
// would reject. `lines` picks the product lines to include.
export async function getPublicCakeCatalog(lines: CatalogLine[] = [ItemCategory.CAKE]) {
  const [designs, flavors] = await Promise.all([
    prisma.productDesign.findMany({
      where: { ...V2_DESIGN_WHERE, category: { in: lines } },
      orderBy: { name: 'asc' },
      include: CATALOG_INCLUDE,
    }),
    prisma.cakeFlavor.findMany({ where: { active: true, category: { in: lines } }, include: { surcharges: true } }),
  ]);

  const catalog = designs
    .map((d) => {
      const colors = d.images
        .map((c) => ({ c, parts: bookableParts(c) }))
        .filter(({ parts }) => parts.complete)
        .map(({ c, parts }) => ({
          id: c.id,
          colorName: c.colorName,
          imageUrl: c.imageUrl,
          sizes: parts.sizes.map((p) => ({
            sizeId: p.sizeId,
            label: p.size.label,
            portions: p.size.portions,
            prepMinutes: p.size.prepMinutes,
            price: Number(p.price),
          })),
          bizcochoIds: parts.bizcochos.map((f) => f.id),
          rellenoIds: parts.rellenos.map((f) => f.id),
          shapes: parts.shapes.map((s) => ({ id: s.id, name: s.name })),
        }));
      return {
        id: d.id,
        name: d.name,
        category: d.category,
        allowsCustomImage: d.allowsCustomImage,
        requiresCustomImage: d.requiresCustomImage,
        allowsCustomText: d.allowsCustomText,
        customTextMaxLength: d.customTextMaxLength,
        imageLimits: Object.fromEntries(d.imageLimits.map((l) => [l.sizeId, l.maxImages])),
        colors,
      };
    })
    .filter((d) => d.colors.length > 0);

  return {
    designs: catalog,
    printImagePrices: PRINT_IMAGE_PRICES,
    // Surcharges per size so the page can show the live price; a size missing
    // from the map costs 0 extra.
    flavors: flavors.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      surcharges: Object.fromEntries(f.surcharges.map((s) => [s.sizeId, Number(s.amount)])),
    })),
  };
}

export interface CakeLineInput {
  productDesignId: string;
  colorId: string;
  sizeId: string;
  bizcochoId: string;
  rellenoId: string;
  shapeId: string;
  customText?: string;
  customImageUrls?: string[];
  printImageType?: string;
}

export function isCakeLineInput(v: unknown): v is CakeLineInput {
  const i = v as Record<string, unknown>;
  return (
    typeof i === 'object' &&
    i !== null &&
    ['productDesignId', 'colorId', 'sizeId', 'bizcochoId', 'rellenoId', 'shapeId'].every(
      (k) => typeof i[k] === 'string' && (i[k] as string).length > 0
    )
  );
}

export class CakeLineError extends Error {}

// A validated cake line, ready to become an OrderItem. Text fields are frozen
// snapshots (size label, flavor names, color…) so the order reads the same
// even if the catalog is edited later — and the mobile app, which falls back
// to customSize/customFlavor/relleno/shape/color when there's no variant,
// shows it with no APK update.
export interface ResolvedCakeLine {
  price: number;
  prepMinutes: number;
  fullPaymentIfAlone: boolean;
  itemData: {
    productDesignId: string;
    variantId: null;
    priceAtOrder: number;
    pointsAtOrder: number;
    prepMinutesAtOrder: number;
    flavor: null;
    customFlavor: string;
    relleno: string;
    shape: string;
    color: string;
    customSize: string;
    customText: string | null;
    customImageUrl: string | null;
    customImageUrls: string[];
    printImageType: PrintImageType | null;
  };
}

// Validates a batch of cake lines against the live catalog and prices them.
// Throws CakeLineError (a message meant for the client) on the first bad line.
export async function resolveCakeLines(lines: CakeLineInput[]): Promise<ResolvedCakeLine[]> {
  if (lines.length === 0) return [];

  const designIds = [...new Set(lines.map((l) => l.productDesignId))];
  const [designs, flavors] = await Promise.all([
    prisma.productDesign.findMany({ where: { ...V2_DESIGN_WHERE, id: { in: designIds } }, include: CATALOG_INCLUDE }),
    prisma.cakeFlavor.findMany({ where: { active: true }, include: { surcharges: true } }),
  ]);
  const designById = new Map(designs.map((d) => [d.id, d]));
  const flavorById = new Map(flavors.map((f) => [f.id, f]));
  const surcharge = (flavorId: string, sizeId: string) =>
    Number(flavorById.get(flavorId)?.surcharges.find((s) => s.sizeId === sizeId)?.amount ?? 0);

  return lines.map((line) => {
    const design = designById.get(line.productDesignId);
    if (!design) throw new CakeLineError('Uno de los diseños ya no está disponible. Revisa tu pedido.');

    const color = design.images.find((c) => c.id === line.colorId);
    if (!color) throw new CakeLineError('Uno de los colores ya no está disponible. Revisa tu pedido.');
    const parts = bookableParts(color);
    if (!parts.complete) throw new CakeLineError(`El color "${color.colorName}" ya no está disponible.`);

    const sizePrice = parts.sizes.find((p) => p.sizeId === line.sizeId);
    if (!sizePrice) throw new CakeLineError('Ese tamaño ya no está disponible para este diseño.');
    const bizcocho = parts.bizcochos.find((f) => f.id === line.bizcochoId);
    if (!bizcocho) throw new CakeLineError('Ese sabor de bizcocho ya no está disponible para este diseño.');
    const relleno = parts.rellenos.find((f) => f.id === line.rellenoId);
    if (!relleno) throw new CakeLineError('Ese sabor de relleno ya no está disponible para este diseño.');
    const shape = parts.shapes.find((s) => s.id === line.shapeId);
    if (!shape) throw new CakeLineError('Esa forma ya no está disponible para este diseño.');

    // Honour the design's flags even if the client posts these fields directly.
    const images = design.allowsCustomImage
      ? (line.customImageUrls ?? []).filter((u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u))
      : [];
    const maxImages = design.imageLimits.find((l) => l.sizeId === line.sizeId)?.maxImages ?? 1;
    if (design.allowsCustomImage && design.requiresCustomImage && images.length === 0) {
      throw new CakeLineError('Este diseño necesita que subas una imagen para imprimir.');
    }
    if (images.length > maxImages) {
      throw new CakeLineError(`Este tamaño admite hasta ${maxImages} ${maxImages === 1 ? 'imagen' : 'imágenes'}.`);
    }

    const text = design.allowsCustomText ? line.customText?.trim() || null : null;
    if (text && text.length > design.customTextMaxLength) {
      throw new CakeLineError(`El texto personalizado no puede pasar de ${design.customTextMaxLength} letras.`);
    }

    // Non-edible unless the client explicitly picked edible.
    const printImageType =
      images.length === 0
        ? null
        : line.printImageType === PrintImageType.EDIBLE
          ? PrintImageType.EDIBLE
          : PrintImageType.NON_EDIBLE;

    const price =
      Number(sizePrice.price) +
      surcharge(bizcocho.id, sizePrice.sizeId) +
      surcharge(relleno.id, sizePrice.sizeId) +
      (printImageType ? PRINT_IMAGE_PRICES[printImageType] : 0);
    const prepMinutes = sizePrice.size.prepMinutes;
    // Same storage split as the legacy multi-image variant: a size that allows
    // several images keeps them all in customImageUrls, otherwise the single
    // image goes in customImageUrl.
    const multiImage = maxImages > 1;

    return {
      price,
      prepMinutes,
      fullPaymentIfAlone: sizePrice.size.requiresFullPayment,
      itemData: {
        productDesignId: design.id,
        variantId: null,
        priceAtOrder: price,
        pointsAtOrder: 0,
        prepMinutesAtOrder: prepMinutes,
        flavor: null,
        customFlavor: bizcocho.name,
        relleno: relleno.name,
        shape: shape.name,
        color: color.colorName,
        customSize: sizePrice.size.label,
        customText: text,
        customImageUrl: multiImage ? null : images[0] ?? null,
        customImageUrls: multiImage ? images : [],
        printImageType,
      },
    };
  });
}
