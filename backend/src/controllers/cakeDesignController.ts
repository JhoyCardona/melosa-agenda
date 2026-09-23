import { Response } from 'express';
import { PrismaClient, ItemCategory, Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

// Catalog saves run several queries in one transaction; Prisma's default 5s cap
// was hit from a dev machine in Colombia talking to Neon in us-east (each
// round trip adds up). Admin-only, low traffic — a longer cap is harmless.
const TX_OPTIONS = { timeout: 15000, maxWait: 10000 };

// Backs the admin "Modificar / agregar diseños" screen (catalog v2). A design
// is a name + customization flags; each of its colors (ProductDesignImage) has
// a photo and its own configuration: allowed flavors, allowed shapes, and the
// offered sizes with their price.
//
// v2 designs are told apart from the legacy catalog by having no
// ProductVariant rows. Legacy designs stay out of this screen (and v2 ones stay
// out of the legacy public catalog) until the switch-over retires them.

const V2_DESIGN_WHERE: Prisma.ProductDesignWhereInput = {
  category: ItemCategory.CAKE,
  archivedAt: null,
  variants: { none: {} },
};

const COLOR_INCLUDE = {
  allowedFlavors: { select: { id: true } },
  allowedShapes: { select: { id: true } },
  sizePrices: true,
} satisfies Prisma.ProductDesignImageInclude;

type ColorWithConfig = Prisma.ProductDesignImageGetPayload<{ include: typeof COLOR_INCLUDE }>;

function colorDto(c: ColorWithConfig) {
  return {
    id: c.id,
    colorName: c.colorName,
    imageUrl: c.imageUrl,
    flavorIds: c.allowedFlavors.map((f) => f.id),
    shapeIds: c.allowedShapes.map((s) => s.id),
    // { sizeId: price } — a size missing from the map is not offered.
    sizePrices: Object.fromEntries(c.sizePrices.map((p) => [p.sizeId, Number(p.price)])),
  };
}

function cleanName(v: unknown, max = 60): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= max ? name : null;
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https:\/\/\S+$/.test(v);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

// Validates the customization flags shared by create and update. Returns the
// data to write, or an error message.
type DesignFlags = Partial<
  Pick<Prisma.ProductDesignCreateInput, 'allowsCustomImage' | 'requiresCustomImage' | 'allowsCustomText' | 'customTextMaxLength'>
>;

function parseFlags(body: Record<string, unknown>): { data: DesignFlags } | { error: string } {
  const data: DesignFlags = {};
  for (const key of ['allowsCustomImage', 'requiresCustomImage', 'allowsCustomText'] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') return { error: `${key} debe ser verdadero o falso` };
    data[key] = body[key] as boolean;
  }
  if (body.customTextMaxLength !== undefined) {
    const n = body.customTextMaxLength;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 200) {
      return { error: 'El máximo de caracteres del texto debe ser un entero entre 1 y 200' };
    }
    data.customTextMaxLength = n;
  }
  return { data };
}

// imageLimits arrive as { [sizeId]: maxImages }. Returns null if malformed.
function parseImageLimits(v: unknown): Record<string, number> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  const ok = entries.every(([, n]) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 20);
  return ok ? (Object.fromEntries(entries) as Record<string, number>) : null;
}

// Replaces the design's per-size image caps. Rows equal to the default (1)
// aren't stored — a missing row already means 1.
async function writeImageLimits(tx: Prisma.TransactionClient, designId: string, limits: Record<string, number>) {
  const sizeIds = Object.keys(limits);
  const found = await tx.cakeSize.count({ where: { id: { in: sizeIds } } });
  if (found !== sizeIds.length) throw new UnknownSizeError();
  await tx.designImageLimit.deleteMany({ where: { designId } });
  const rows = Object.entries(limits).filter(([, n]) => n > 1);
  if (rows.length > 0) {
    await tx.designImageLimit.createMany({
      data: rows.map(([sizeId, maxImages]) => ({ designId, sizeId, maxImages })),
    });
  }
}

class UnknownSizeError extends Error {}

const IMAGE_LIMITS_ERROR = 'El máximo de imágenes de cada tamaño debe ser un entero entre 1 y 20';

// The design's cover photo (used by catalog grids) is its first color's photo.
async function refreshCover(tx: Prisma.TransactionClient, designId: string) {
  const first = await tx.productDesignImage.findFirst({
    where: { productDesignId: designId },
    orderBy: { createdAt: 'asc' },
  });
  await tx.productDesign.update({ where: { id: designId }, data: { imageUrl: first?.imageUrl ?? null } });
}

async function findV2Design(id: string) {
  return prisma.productDesign.findFirst({ where: { id, ...V2_DESIGN_WHERE } });
}

// ─── Designs ───

export async function listCakeDesigns(req: AuthRequest, res: Response) {
  try {
    const designs = await prisma.productDesign.findMany({
      where: V2_DESIGN_WHERE,
      orderBy: { name: 'asc' },
      include: { images: { orderBy: { createdAt: 'asc' }, include: COLOR_INCLUDE }, imageLimits: true },
    });
    res.json(
      designs.map((d) => ({
        id: d.id,
        name: d.name,
        imageUrl: d.imageUrl,
        allowsCustomImage: d.allowsCustomImage,
        requiresCustomImage: d.requiresCustomImage,
        allowsCustomText: d.allowsCustomText,
        customTextMaxLength: d.customTextMaxLength,
        // { sizeId: max print images } — a size missing from the map allows 1.
        imageLimits: Object.fromEntries(d.imageLimits.map((l) => [l.sizeId, l.maxImages])),
        colors: d.images.map(colorDto),
      }))
    );
  } catch (error) {
    console.error('Error listando diseños (v2):', error);
    res.status(500).json({ error: 'Error al listar los diseños' });
  }
}

export async function createCakeDesign(req: AuthRequest, res: Response) {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'El nombre del diseño es obligatorio (máx. 60 caracteres)' });
  const flags = parseFlags(req.body);
  if ('error' in flags) return res.status(400).json({ error: flags.error });
  const imageLimits = req.body.imageLimits === undefined ? null : parseImageLimits(req.body.imageLimits);
  if (req.body.imageLimits !== undefined && !imageLimits) return res.status(400).json({ error: IMAGE_LIMITS_ERROR });

  try {
    // Names aren't a DB-level unique (legacy designs are nameless), so check
    // among the active v2 designs, ignoring case.
    const clash = await prisma.productDesign.findFirst({
      where: { ...V2_DESIGN_WHERE, name: { equals: name, mode: 'insensitive' } },
    });
    if (clash) return res.status(409).json({ error: 'Ya existe un diseño con ese nombre' });

    const design = await prisma.$transaction(async (tx) => {
      const created = await tx.productDesign.create({
        data: {
          name,
          category: ItemCategory.CAKE,
          allowsCustomText: false,
          ...flags.data,
        },
      });
      if (imageLimits) await writeImageLimits(tx, created.id, imageLimits);
      return created;
    }, TX_OPTIONS);
    res.status(201).json(design);
  } catch (error) {
    if (error instanceof UnknownSizeError) return res.status(400).json({ error: 'Alguno de los tamaños ya no existe; recarga la página' });
    console.error('Error creando diseño (v2):', error);
    res.status(500).json({ error: 'Error al crear el diseño' });
  }
}

export async function updateCakeDesign(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const flags = parseFlags(req.body);
  if ('error' in flags) return res.status(400).json({ error: flags.error });
  const data: Prisma.ProductDesignUpdateInput = { ...flags.data };
  const imageLimits = req.body.imageLimits === undefined ? null : parseImageLimits(req.body.imageLimits);
  if (req.body.imageLimits !== undefined && !imageLimits) return res.status(400).json({ error: IMAGE_LIMITS_ERROR });

  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'El nombre del diseño no puede quedar vacío (máx. 60 caracteres)' });
    data.name = name;
  }

  try {
    if (!(await findV2Design(id))) return res.status(404).json({ error: 'Diseño no encontrado' });
    if (typeof data.name === 'string') {
      const clash = await prisma.productDesign.findFirst({
        where: { ...V2_DESIGN_WHERE, id: { not: id }, name: { equals: data.name, mode: 'insensitive' } },
      });
      if (clash) return res.status(409).json({ error: 'Ya existe un diseño con ese nombre' });
    }
    const design = await prisma.$transaction(async (tx) => {
      const updated = await tx.productDesign.update({ where: { id }, data });
      if (imageLimits) await writeImageLimits(tx, id, imageLimits);
      return updated;
    }, TX_OPTIONS);
    res.json(design);
  } catch (error) {
    if (error instanceof UnknownSizeError) return res.status(400).json({ error: 'Alguno de los tamaños ya no existe; recarga la página' });
    console.error('Error editando diseño (v2):', error);
    res.status(500).json({ error: 'Error al editar el diseño' });
  }
}

// ─── Colors ───

export async function createDesignColor(req: AuthRequest, res: Response) {
  const designId = String(req.params.id);
  const colorName = cleanName(req.body.colorName, 40);
  const { imageUrl } = req.body;

  if (!colorName) return res.status(400).json({ error: 'El nombre del color es obligatorio (máx. 40 caracteres)' });
  if (!isHttpsUrl(imageUrl)) return res.status(400).json({ error: 'Un color nuevo necesita su foto' });

  try {
    if (!(await findV2Design(designId))) return res.status(404).json({ error: 'Diseño no encontrado' });
    const color = await prisma.$transaction(async (tx) => {
      const created = await tx.productDesignImage.create({
        data: { productDesignId: designId, colorName, imageUrl },
        include: COLOR_INCLUDE,
      });
      await refreshCover(tx, designId);
      return created;
    }, TX_OPTIONS);
    res.status(201).json(colorDto(color));
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'Este diseño ya tiene un color con ese nombre' });
    console.error('Error creando color:', error);
    res.status(500).json({ error: 'Error al crear el color' });
  }
}

export async function updateDesignColor(req: AuthRequest, res: Response) {
  const colorId = String(req.params.colorId);
  const data: Prisma.ProductDesignImageUpdateInput = {};

  if (req.body.colorName !== undefined) {
    const colorName = cleanName(req.body.colorName, 40);
    if (!colorName) return res.status(400).json({ error: 'El nombre del color no puede quedar vacío (máx. 40 caracteres)' });
    data.colorName = colorName;
  }
  if (req.body.imageUrl !== undefined) {
    if (!isHttpsUrl(req.body.imageUrl)) return res.status(400).json({ error: 'La foto no es válida' });
    data.imageUrl = req.body.imageUrl;
  }

  try {
    const color = await prisma.$transaction(async (tx) => {
      const updated = await tx.productDesignImage.update({ where: { id: colorId }, data, include: COLOR_INCLUDE });
      await refreshCover(tx, updated.productDesignId);
      return updated;
    }, TX_OPTIONS);
    res.json(colorDto(color));
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Color no encontrado' });
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'Este diseño ya tiene un color con ese nombre' });
    console.error('Error editando color:', error);
    res.status(500).json({ error: 'Error al editar el color' });
  }
}

// Past orders keep the color as a text snapshot (OrderItem.color), so removing
// it here doesn't touch history. The photo stays in Cloudinary on purpose.
export async function deleteDesignColor(req: AuthRequest, res: Response) {
  const colorId = String(req.params.colorId);
  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.productDesignImage.delete({ where: { id: colorId } });
      await refreshCover(tx, deleted.productDesignId);
    }, TX_OPTIONS);
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Color no encontrado' });
    console.error('Error eliminando color:', error);
    res.status(500).json({ error: 'Error al eliminar el color' });
  }
}

// Replaces a color's whole configuration in one go: allowed flavors, allowed
// shapes, and offered sizes with price. Sending the full picture (instead of
// per-checkbox calls) keeps it consistent and makes "copy from another color"
// a plain client-side prefill.
export async function saveColorConfig(req: AuthRequest, res: Response) {
  const colorId = String(req.params.colorId);
  const { flavorIds, shapeIds, sizePrices } = req.body as {
    flavorIds?: unknown;
    shapeIds?: unknown;
    sizePrices?: unknown;
  };

  const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (!isIdList(flavorIds) || !isIdList(shapeIds)) {
    return res.status(400).json({ error: 'flavorIds y shapeIds deben ser listas' });
  }
  if (typeof sizePrices !== 'object' || sizePrices === null || Array.isArray(sizePrices)) {
    return res.status(400).json({ error: 'sizePrices debe ser un objeto { tamaño: precio }' });
  }
  const prices = Object.entries(sizePrices as Record<string, unknown>);
  if (!prices.every(([, p]) => typeof p === 'number' && Number.isInteger(p) && p > 0)) {
    return res.status(400).json({ error: 'Cada tamaño marcado necesita un precio mayor a 0' });
  }

  try {
    const [flavorCount, shapeCount, sizeCount] = await Promise.all([
      prisma.cakeFlavor.count({ where: { id: { in: flavorIds } } }),
      prisma.cakeShape.count({ where: { id: { in: shapeIds } } }),
      prisma.cakeSize.count({ where: { id: { in: prices.map(([id]) => id) } } }),
    ]);
    if (flavorCount !== new Set(flavorIds).size || shapeCount !== new Set(shapeIds).size || sizeCount !== prices.length) {
      return res.status(400).json({ error: 'Algún sabor, forma o tamaño ya no existe; recarga la página' });
    }

    const color = await prisma.$transaction(async (tx) => {
      await tx.colorSizePrice.deleteMany({ where: { colorId } });
      if (prices.length > 0) {
        await tx.colorSizePrice.createMany({
          data: prices.map(([sizeId, price]) => ({ colorId, sizeId, price: price as number })),
        });
      }
      return tx.productDesignImage.update({
        where: { id: colorId },
        data: {
          allowedFlavors: { set: flavorIds.map((id) => ({ id })) },
          allowedShapes: { set: shapeIds.map((id) => ({ id })) },
        },
        include: COLOR_INCLUDE,
      });
    }, TX_OPTIONS);
    res.json(colorDto(color));
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Color no encontrado' });
    console.error('Error guardando configuración del color:', error);
    res.status(500).json({ error: 'Error al guardar la configuración del color' });
  }
}
