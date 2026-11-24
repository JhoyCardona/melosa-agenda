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

// Cupcakes charge their own image price, once per box whatever its size
// (gretica, Nov 2026: non-edible +4.000, edible +14.000).
const CUPCAKE_PRINT_IMAGE_PRICES: Record<PrintImageType, number> = {
  NON_EDIBLE: 4000,
  EDIBLE: 14000,
};

export function printImagePricesFor(category: ItemCategory): Record<PrintImageType, number> {
  return category === ItemCategory.CUPCAKE ? CUPCAKE_PRINT_IMAGE_PRICES : PRINT_IMAGE_PRICES;
}

// Product lines that use the v2 catalog (designs + colors + their own
// sizes/flavors/shapes). Alfajor cakes and small alfajores run on the same
// machinery as cakes, each line with its own settings. For small alfajores
// (ALFAJOR_UNIT) a design is a FLAVOR: its color holds the photo, the shapes
// and the price of ONE alfajor per size; the client also picks a quantity
// (AlfajorQuantity) and a box decoration (AlfajorBox), which are global.
// Cupcakes (CUPCAKE): a size is a box (x3, x6, x12 — `portions` = cupcakes in
// it), there is no shape, and flavor surcharges are per cupcake.
export const CATALOG_LINES = [
  ItemCategory.CAKE,
  ItemCategory.ALFAJOR_CAKE,
  ItemCategory.ALFAJOR_UNIT,
  ItemCategory.CUPCAKE,
] as const;
export type CatalogLine = (typeof CATALOG_LINES)[number];

// Lines whose products have no shape to pick (a cupcake is a cupcake).
function usesShapes(category: ItemCategory): boolean {
  return category !== ItemCategory.CUPCAKE;
}

// Cupcake flavor surcharges are stored per cupcake (a relleno costs $500 per
// cupcake) and charged for every cupcake in the box: x6 → 6 × 500. Every other
// line stores the surcharge per cake, already for that size.
function flavorSurchargeFor(category: ItemCategory, stored: number, size: { portions: number }): number {
  return category === ItemCategory.CUPCAKE ? stored * size.portions : stored;
}

// Print images allowed on one item when the design sets no limit for the
// size: one per cupcake in a cupcake box (one image can also be repeated on
// all of them), one for anything else.
function defaultMaxImages(category: ItemCategory, size: { portions: number }): number {
  return category === ItemCategory.CUPCAKE ? size.portions : 1;
}

// Reads a product line from a query/body value. Missing = CAKE, so callers
// that predate alfajor (installed web, old links) keep getting cakes only.
export function parseCatalogLine(v: unknown): CatalogLine | null {
  if (v === undefined) return ItemCategory.CAKE;
  return CATALOG_LINES.find((l) => l === v) ?? null;
}

// A small-alfajor design from the old box-as-design model (unitsPerBox set,
// Nov 20–24 2026) is never bookable: small alfajores are now one design per
// flavor, with the box picked separately.
function isBookableDesign(d: { category: ItemCategory; unitsPerBox: number | null }): boolean {
  return d.category !== ItemCategory.ALFAJOR_UNIT || d.unitsPerBox === null;
}

// Small alfajores have no bizcocho/relleno to pick: the design IS the flavor.
function usesFlavors(category: ItemCategory): boolean {
  return category !== ItemCategory.ALFAJOR_UNIT;
}

// Active quantities and boxes of small alfajores, with every box price for an
// active alfajor size. Only offered combinations are returned (a price row of
// an active box × active quantity × active size).
async function loadAlfajorBoxes() {
  const [quantities, boxes] = await Promise.all([
    prisma.alfajorQuantity.findMany({ where: { active: true }, orderBy: { units: 'asc' } }),
    prisma.alfajorBox.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: { prices: { where: { quantity: { active: true }, size: { active: true } } } },
    }),
  ]);
  return { quantities, boxes: boxes.filter((b) => b.prices.length > 0) };
}
type AlfajorBoxes = Awaited<ReturnType<typeof loadAlfajorBoxes>>;

// Sizes for which at least one box (any quantity) has a price.
function sizesWithBoxes(boxes: AlfajorBoxes): Set<string> {
  return new Set(boxes.boxes.flatMap((b) => b.prices.map((p) => p.sizeId)));
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
// For small alfajores, `boxSizes` (sizes that have a box price) narrows the
// sizes too: an alfajor size with no box to pack it in can't be booked.
function bookableParts(color: CatalogColor, category: ItemCategory, boxSizes?: Set<string>) {
  const sizes = color.sizePrices
    .filter((p) => p.size.active && (!boxSizes || boxSizes.has(p.sizeId)))
    .sort((a, b) => a.size.portions - b.size.portions);
  const bizcochos = color.allowedFlavors.filter((f) => f.active && f.kind === FlavorKind.BIZCOCHO);
  const rellenos = color.allowedFlavors.filter((f) => f.active && f.kind === FlavorKind.RELLENO);
  const shapes = color.allowedShapes.filter((s) => s.active);
  const complete =
    sizes.length > 0 &&
    ((bizcochos.length > 0 && rellenos.length > 0) || !usesFlavors(category)) &&
    (shapes.length > 0 || !usesShapes(category));
  return { sizes, bizcochos, rellenos, shapes, complete };
}

// Public cake catalog: every v2 design with at least one complete color. An
// incomplete color (no active size, bizcocho, relleno or shape) is left out
// entirely, so the booking page never offers something the order endpoint
// would reject. `lines` picks the product lines to include.
export async function getPublicCakeCatalog(lines: CatalogLine[] = [ItemCategory.CAKE]) {
  const withAlfajores = lines.includes(ItemCategory.ALFAJOR_UNIT);
  const [designs, flavors, alfajorBoxes] = await Promise.all([
    prisma.productDesign.findMany({
      where: { ...V2_DESIGN_WHERE, category: { in: lines } },
      orderBy: { name: 'asc' },
      include: CATALOG_INCLUDE,
    }),
    prisma.cakeFlavor.findMany({
      where: { active: true, category: { in: lines } },
      include: { surcharges: { include: { size: true } } },
    }),
    withAlfajores ? loadAlfajorBoxes() : null,
  ]);
  const alfajorBoxSizes = alfajorBoxes ? sizesWithBoxes(alfajorBoxes) : undefined;

  const catalog = designs
    .filter(isBookableDesign)
    .map((d) => {
      const colors = d.images
        .map((c) => ({
          c,
          parts: bookableParts(c, d.category, d.category === ItemCategory.ALFAJOR_UNIT ? alfajorBoxSizes : undefined),
        }))
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
            // Small alfajores: the price of ONE alfajor of this size.
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
        // Legacy field (old alfajor box designs, never bookable now): always null.
        unitsPerBox: null,
        // { sizeId: max print images }. Cupcake boxes list every size (one
        // image per cupcake by default); other lines only the sizes above 1.
        imageLimits: {
          ...(d.category === ItemCategory.CUPCAKE
            ? Object.fromEntries(
                colors.flatMap((c) => c.sizes).map((sz) => [sz.sizeId, defaultMaxImages(d.category, sz)]),
              )
            : {}),
          ...Object.fromEntries(d.imageLimits.map((l) => [l.sizeId, l.maxImages])),
        },
        colors,
      };
    })
    .filter((d) => d.colors.length > 0);

  return {
    designs: catalog,
    // Cake prices, kept for pages that predate per-line prices; the booking
    // pages read the line's own entry from printImagePricesByLine.
    printImagePrices: PRINT_IMAGE_PRICES,
    printImagePricesByLine: Object.fromEntries(lines.map((l) => [l, printImagePricesFor(l)])),
    // Surcharges per size so the page can show the live price; a size missing
    // from the map costs 0 extra.
    flavors: flavors.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      // Already multiplied for the size (cupcakes: per cupcake × box size).
      surcharges: Object.fromEntries(
        f.surcharges.map((s) => [s.sizeId, flavorSurchargeFor(f.category, Number(s.amount), s.size)]),
      ),
    })),
    // Small alfajores: the quantities and boxes every flavor shares. A box's
    // `prices` = { quantityId: { sizeId: box price } }; a missing entry isn't
    // offered. Null when the request didn't include small alfajores.
    alfajorBoxes: alfajorBoxes
      ? {
          quantities: alfajorBoxes.quantities.map((q) => ({ id: q.id, units: q.units, prepMinutes: q.prepMinutes })),
          boxes: alfajorBoxes.boxes.map((b) => {
            const prices: Record<string, Record<string, number>> = {};
            for (const p of b.prices) (prices[p.quantityId] ??= {})[p.sizeId] = Number(p.price);
            return { id: b.id, name: b.name, imageUrl: b.imageUrl, prices };
          }),
        }
      : null,
  };
}

export interface CakeLineInput {
  productDesignId: string;
  colorId: string;
  sizeId: string;
  // Empty/missing for small alfajores (the design is the flavor).
  bizcochoId?: string;
  rellenoId?: string;
  // Empty/missing for lines without shapes (cupcakes).
  shapeId?: string;
  // Small alfajores only: the quantity (AlfajorQuantity) and box decoration
  // (AlfajorBox) picked.
  quantityId?: string;
  boxId?: string;
  customText?: string;
  customImageUrls?: string[];
  printImageType?: string;
}

export function isCakeLineInput(v: unknown): v is CakeLineInput {
  const i = v as Record<string, unknown>;
  return (
    typeof i === 'object' &&
    i !== null &&
    ['productDesignId', 'colorId', 'sizeId'].every((k) => typeof i[k] === 'string' && (i[k] as string).length > 0) &&
    // Either the flavors (cakes, cupcakes) or the box (small alfajores).
    (['bizcochoId', 'rellenoId'].every((k) => typeof i[k] === 'string' && (i[k] as string).length > 0) ||
      ['quantityId', 'boxId'].every((k) => typeof i[k] === 'string' && (i[k] as string).length > 0)) &&
    (i.shapeId === undefined || i.shapeId === null || typeof i.shapeId === 'string')
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
  // Small alfajores in this line (the quantity picked); 0 for anything else.
  alfajorUnits: number;
  itemData: {
    productDesignId: string;
    variantId: null;
    priceAtOrder: number;
    pointsAtOrder: number;
    prepMinutesAtOrder: number;
    flavor: null;
    customFlavor: string;
    relleno: string | null;
    shape: string | null;
    color: string;
    customSize: string;
    customText: string | null;
    customImageUrl: string | null;
    customImageUrls: string[];
    printImageType: PrintImageType | null;
    unitsAtOrder: number | null;
  };
}

// Validates a batch of cake lines against the live catalog and prices them.
// Throws CakeLineError (a message meant for the client) on the first bad line.
export async function resolveCakeLines(lines: CakeLineInput[]): Promise<ResolvedCakeLine[]> {
  if (lines.length === 0) return [];

  const designIds = [...new Set(lines.map((l) => l.productDesignId))];
  const [designs, flavors, alfajorBoxes] = await Promise.all([
    prisma.productDesign.findMany({ where: { ...V2_DESIGN_WHERE, id: { in: designIds } }, include: CATALOG_INCLUDE }),
    prisma.cakeFlavor.findMany({ where: { active: true }, include: { surcharges: { include: { size: true } } } }),
    lines.some((l) => l.quantityId || l.boxId) ? loadAlfajorBoxes() : null,
  ]);
  const designById = new Map(designs.map((d) => [d.id, d]));
  const flavorById = new Map(flavors.map((f) => [f.id, f]));
  const surcharge = (flavorId: string, sizeId: string) => {
    const flavor = flavorById.get(flavorId);
    const row = flavor?.surcharges.find((s) => s.sizeId === sizeId);
    return flavor && row ? flavorSurchargeFor(flavor.category, Number(row.amount), row.size) : 0;
  };

  return lines.map((line) => {
    const design = designById.get(line.productDesignId);
    if (!design || !isBookableDesign(design)) {
      throw new CakeLineError('Uno de los diseños ya no está disponible. Revisa tu pedido.');
    }

    const color = design.images.find((c) => c.id === line.colorId);
    if (!color) throw new CakeLineError('Uno de los colores ya no está disponible. Revisa tu pedido.');
    const parts = bookableParts(color, design.category);
    if (!parts.complete) throw new CakeLineError(`El color "${color.colorName}" ya no está disponible.`);

    const sizePrice = parts.sizes.find((p) => p.sizeId === line.sizeId);
    if (!sizePrice) throw new CakeLineError('Ese tamaño ya no está disponible para este diseño.');

    if (design.category === ItemCategory.ALFAJOR_UNIT) {
      return resolveAlfajorLine(line, design, color, parts, sizePrice, alfajorBoxes);
    }
    const bizcocho = parts.bizcochos.find((f) => f.id === line.bizcochoId);
    if (!bizcocho) throw new CakeLineError('Ese sabor de bizcocho ya no está disponible para este diseño.');
    const relleno = parts.rellenos.find((f) => f.id === line.rellenoId);
    if (!relleno) throw new CakeLineError('Ese sabor de relleno ya no está disponible para este diseño.');
    // Lines without shapes (cupcakes) store no shape; the others must pick one.
    const shape = usesShapes(design.category) ? parts.shapes.find((s) => s.id === line.shapeId) : null;
    if (usesShapes(design.category) && !shape) {
      throw new CakeLineError('Esa forma ya no está disponible para este diseño.');
    }

    // Honour the design's flags even if the client posts these fields directly.
    const images = design.allowsCustomImage
      ? (line.customImageUrls ?? []).filter((u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u))
      : [];
    const maxImages =
      design.imageLimits.find((l) => l.sizeId === line.sizeId)?.maxImages ??
      defaultMaxImages(design.category, sizePrice.size);
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
      (printImageType ? printImagePricesFor(design.category)[printImageType] : 0);
    const prepMinutes = sizePrice.size.prepMinutes;
    // Same storage split as the legacy multi-image variant: a size that allows
    // several images keeps them all in customImageUrls, otherwise the single
    // image goes in customImageUrl.
    const multiImage = maxImages > 1;

    return {
      price,
      prepMinutes,
      fullPaymentIfAlone: sizePrice.size.requiresFullPayment,
      alfajorUnits: 0,
      itemData: {
        productDesignId: design.id,
        variantId: null,
        priceAtOrder: price,
        pointsAtOrder: 0,
        prepMinutesAtOrder: prepMinutes,
        flavor: null,
        customFlavor: bizcocho.name,
        relleno: relleno.name,
        shape: shape?.name ?? null,
        color: color.colorName,
        customSize: sizePrice.size.label,
        customText: text,
        customImageUrl: multiImage ? null : images[0] ?? null,
        customImageUrls: multiImage ? images : [],
        printImageType,
        unitsAtOrder: null,
      },
    };
  });
}

// A small-alfajor line: flavor (the design) + size + shape + quantity + box.
// Price = price of 1 alfajor × quantity + the box's price for that quantity
// and size. Minutes = the quantity's packing minutes. Never personalized.
// The text snapshots are what the installed mobile app shows (no APK update):
// title "Alfajor de chocolate - Mini x15 · caja Clásica", Sabor = the flavor.
function resolveAlfajorLine(
  line: CakeLineInput,
  design: CatalogDesign,
  color: CatalogColor,
  parts: ReturnType<typeof bookableParts>,
  sizePrice: ReturnType<typeof bookableParts>['sizes'][number],
  boxes: AlfajorBoxes | null,
): ResolvedCakeLine {
  const quantity = boxes?.quantities.find((q) => q.id === line.quantityId);
  if (!quantity) throw new CakeLineError('Esa cantidad de alfajores ya no está disponible. Revisa tu pedido.');
  const box = boxes?.boxes.find((b) => b.id === line.boxId);
  if (!box) throw new CakeLineError('Esa caja ya no está disponible. Revisa tu pedido.');
  const boxPrice = box.prices.find((p) => p.quantityId === quantity.id && p.sizeId === sizePrice.sizeId);
  if (!boxPrice) throw new CakeLineError(`La caja ${box.name} no viene en esa cantidad y tamaño.`);
  const shape = parts.shapes.find((s) => s.id === line.shapeId);
  if (!shape) throw new CakeLineError('Esa forma ya no está disponible para este alfajor.');

  const price = Number(sizePrice.price) * quantity.units + Number(boxPrice.price);
  return {
    price,
    prepMinutes: quantity.prepMinutes,
    fullPaymentIfAlone: sizePrice.size.requiresFullPayment,
    alfajorUnits: quantity.units,
    itemData: {
      productDesignId: design.id,
      variantId: null,
      priceAtOrder: price,
      pointsAtOrder: 0,
      prepMinutesAtOrder: quantity.prepMinutes,
      flavor: null,
      customFlavor: design.name,
      relleno: null,
      shape: shape.name,
      color: box.name,
      customSize: alfajorSizeLabel(sizePrice.size.label, quantity.units, box.name),
      customText: null,
      customImageUrl: null,
      customImageUrls: [],
      printImageType: null,
      unitsAtOrder: quantity.units,
    },
  };
}

// "Mini x15 · caja Clásica" — the size snapshot of a small-alfajor line.
export function alfajorSizeLabel(sizeLabel: string, units: number, boxName: string): string {
  return `${sizeLabel} x${units} · caja ${boxName}`;
}
