import { Response } from 'express';
import { PrismaClient, FlavorKind, ItemCategory, Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';
import { parseCatalogLine } from '../services/cakeCatalog';

const prisma = new PrismaClient();

// Catalog saves run several queries in one transaction; Prisma's default 5s cap
// was hit from a dev machine in Colombia talking to Neon in us-east (each
// round trip adds up). Admin-only, low traffic — a longer cap is harmless.
const TX_OPTIONS = { timeout: 15000, maxWait: 10000 };

// Backs the admin "Sabores, tamaños y formas" screen (catalog v2): the global
// lists every cake design picks from. All routes are admin-only. New rows are
// created inactive — gretica ticks "active" once a size/flavor is fully set up,
// so a half-configured one never reaches the public booking page.
// Each product line (cakes, alfajor cakes) has its own lists: GET takes
// ?category=, creates take `category` in the body (both default to CAKE).

const VALID_KINDS = Object.values(FlavorKind);

// The whole timeline is 2:00pm-8:30pm (390 min); a single cake can't exceed it.
const MAX_PREP_MINUTES = 390;

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= 60 ? name : null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

// Surcharges arrive as { [sizeId]: amountInPesos }. Returns null if malformed.
function parseSurcharges(v: unknown): Record<string, number> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.every(([, amount]) => isNonNegativeInt(amount))) return null;
  return Object.fromEntries(entries) as Record<string, number>;
}

// Upserts one FlavorSurcharge row per size. Only sizes of the flavor's own
// product line are written; an unknown sizeId is rejected up front so a typo
// can't silently vanish.
async function writeSurcharges(
  tx: Prisma.TransactionClient,
  flavorId: string,
  category: ItemCategory,
  surcharges: Record<string, number>
) {
  const sizeIds = Object.keys(surcharges);
  if (sizeIds.length === 0) return;
  const found = await tx.cakeSize.count({ where: { id: { in: sizeIds }, category } });
  if (found !== sizeIds.length) throw new UnknownSizeError();
  for (const [sizeId, amount] of Object.entries(surcharges)) {
    await tx.flavorSurcharge.upsert({
      where: { flavorId_sizeId: { flavorId, sizeId } },
      create: { flavorId, sizeId, amount },
      update: { amount },
    });
  }
}

class UnknownSizeError extends Error {}

// ─── Full listing ───

// Everything the settings screen needs in one call. Each flavor carries its
// surcharges as a { sizeId: amount } map (a missing size = 0), and every row
// carries how many design colors use it, so the UI can warn before a delete.
export async function getCakeSettings(req: AuthRequest, res: Response) {
  const category = parseCatalogLine(req.query.category);
  if (!category) return res.status(400).json({ error: 'category no válida' });
  try {
    const [sizes, flavors, shapes] = await Promise.all([
      prisma.cakeSize.findMany({
        where: { category },
        orderBy: { portions: 'asc' },
        include: { _count: { select: { colorPrices: true } } },
      }),
      prisma.cakeFlavor.findMany({
        where: { category },
        orderBy: { createdAt: 'asc' },
        include: { surcharges: true, _count: { select: { colors: true } } },
      }),
      prisma.cakeShape.findMany({
        where: { category },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { colors: true } } },
      }),
    ]);

    const flavorDto = (f: (typeof flavors)[number]) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      active: f.active,
      usedByColors: f._count.colors,
      surcharges: Object.fromEntries(f.surcharges.map((s) => [s.sizeId, Number(s.amount)])),
    });

    res.json({
      sizes: sizes.map(({ _count, ...s }) => ({ ...s, usedByColors: _count.colorPrices })),
      bizcochos: flavors.filter((f) => f.kind === FlavorKind.BIZCOCHO).map(flavorDto),
      rellenos: flavors.filter((f) => f.kind === FlavorKind.RELLENO).map(flavorDto),
      shapes: shapes.map(({ _count, ...s }) => ({ ...s, usedByColors: _count.colors })),
    });
  } catch (error) {
    console.error('Error listando sabores/tamaños/formas:', error);
    res.status(500).json({ error: 'Error al cargar sabores, tamaños y formas' });
  }
}

// ─── Sizes ───

export async function createCakeSize(req: AuthRequest, res: Response) {
  const { portions, prepMinutes, requiresFullPayment } = req.body;
  const label = cleanName(req.body.label);
  const category = parseCatalogLine(req.body.category);

  if (!category) return res.status(400).json({ error: 'category no válida' });
  if (!label) return res.status(400).json({ error: 'El nombre del tamaño es obligatorio (máx. 60 caracteres)' });
  if (!isPositiveInt(portions)) return res.status(400).json({ error: 'Las porciones deben ser un número entero mayor a 0' });
  if (!isPositiveInt(prepMinutes) || prepMinutes > MAX_PREP_MINUTES) {
    return res.status(400).json({ error: `Los minutos deben ser un entero entre 1 y ${MAX_PREP_MINUTES}` });
  }
  if (requiresFullPayment !== undefined && typeof requiresFullPayment !== 'boolean') {
    return res.status(400).json({ error: 'requiresFullPayment debe ser verdadero o falso' });
  }

  try {
    const size = await prisma.cakeSize.create({
      data: { category, label, portions, prepMinutes, requiresFullPayment: requiresFullPayment ?? false },
    });
    res.status(201).json(size);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'Ya existe un tamaño con ese nombre o esa cantidad de porciones' });
    }
    console.error('Error creando tamaño:', error);
    res.status(500).json({ error: 'Error al crear el tamaño' });
  }
}

export async function updateCakeSize(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const { portions, prepMinutes, requiresFullPayment, active } = req.body;
  const data: Prisma.CakeSizeUpdateInput = {};

  if (req.body.label !== undefined) {
    const label = cleanName(req.body.label);
    if (!label) return res.status(400).json({ error: 'El nombre del tamaño no puede quedar vacío (máx. 60 caracteres)' });
    data.label = label;
  }
  if (portions !== undefined) {
    if (!isPositiveInt(portions)) return res.status(400).json({ error: 'Las porciones deben ser un número entero mayor a 0' });
    data.portions = portions;
  }
  if (prepMinutes !== undefined) {
    if (!isPositiveInt(prepMinutes) || prepMinutes > MAX_PREP_MINUTES) {
      return res.status(400).json({ error: `Los minutos deben ser un entero entre 1 y ${MAX_PREP_MINUTES}` });
    }
    data.prepMinutes = prepMinutes;
  }
  if (requiresFullPayment !== undefined) {
    if (typeof requiresFullPayment !== 'boolean') return res.status(400).json({ error: 'requiresFullPayment debe ser verdadero o falso' });
    data.requiresFullPayment = requiresFullPayment;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active debe ser verdadero o falso' });
    data.active = active;
  }

  try {
    const size = await prisma.cakeSize.update({ where: { id }, data });
    res.json(size);
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Tamaño no encontrado' });
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'Ya existe un tamaño con ese nombre o esa cantidad de porciones' });
    }
    console.error('Error editando tamaño:', error);
    res.status(500).json({ error: 'Error al editar el tamaño' });
  }
}

// Deleting a size also removes its price from every design color and its
// surcharge from every flavor (cascade). Past orders are untouched — they keep
// the size as a text snapshot (OrderItem.customSize), not a foreign key.
export async function deleteCakeSize(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    await prisma.cakeSize.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Tamaño no encontrado' });
    console.error('Error eliminando tamaño:', error);
    res.status(500).json({ error: 'Error al eliminar el tamaño' });
  }
}

// ─── Flavors (bizcocho + relleno) ───

export async function createCakeFlavor(req: AuthRequest, res: Response) {
  const name = cleanName(req.body.name);
  const kind = req.body.kind as FlavorKind;
  const surcharges = req.body.surcharges === undefined ? {} : parseSurcharges(req.body.surcharges);
  const category = parseCatalogLine(req.body.category);

  if (!category) return res.status(400).json({ error: 'category no válida' });
  if (!name) return res.status(400).json({ error: 'El nombre del sabor es obligatorio (máx. 60 caracteres)' });
  if (!VALID_KINDS.includes(kind)) return res.status(400).json({ error: `kind debe ser uno de: ${VALID_KINDS.join(', ')}` });
  if (!surcharges) return res.status(400).json({ error: 'Los recargos deben ser montos enteros mayores o iguales a 0' });

  try {
    const flavor = await prisma.$transaction(async (tx) => {
      const created = await tx.cakeFlavor.create({ data: { category, name, kind } });
      await writeSurcharges(tx, created.id, category, surcharges);
      return created;
    }, TX_OPTIONS);
    res.status(201).json(flavor);
  } catch (error) {
    if (error instanceof UnknownSizeError) return res.status(400).json({ error: 'Uno de los tamaños del recargo no existe' });
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'Ya existe un sabor con ese nombre' });
    console.error('Error creando sabor:', error);
    res.status(500).json({ error: 'Error al crear el sabor' });
  }
}

export async function updateCakeFlavor(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const { active } = req.body;
  const data: Prisma.CakeFlavorUpdateInput = {};

  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'El nombre del sabor no puede quedar vacío (máx. 60 caracteres)' });
    data.name = name;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active debe ser verdadero o falso' });
    data.active = active;
  }
  const surcharges = req.body.surcharges === undefined ? {} : parseSurcharges(req.body.surcharges);
  if (!surcharges) return res.status(400).json({ error: 'Los recargos deben ser montos enteros mayores o iguales a 0' });

  try {
    const flavor = await prisma.$transaction(async (tx) => {
      const updated = await tx.cakeFlavor.update({ where: { id }, data });
      await writeSurcharges(tx, id, updated.category, surcharges);
      return updated;
    }, TX_OPTIONS);
    res.json(flavor);
  } catch (error) {
    if (error instanceof UnknownSizeError) return res.status(400).json({ error: 'Uno de los tamaños del recargo no existe' });
    if (isNotFound(error)) return res.status(404).json({ error: 'Sabor no encontrado' });
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'Ya existe un sabor con ese nombre' });
    console.error('Error editando sabor:', error);
    res.status(500).json({ error: 'Error al editar el sabor' });
  }
}

// Removes the flavor from every design color that allowed it. Past orders keep
// it as a text snapshot, so history is unaffected.
export async function deleteCakeFlavor(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    await prisma.cakeFlavor.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Sabor no encontrado' });
    console.error('Error eliminando sabor:', error);
    res.status(500).json({ error: 'Error al eliminar el sabor' });
  }
}

// ─── Shapes ───

export async function createCakeShape(req: AuthRequest, res: Response) {
  const name = cleanName(req.body.name);
  const category = parseCatalogLine(req.body.category);
  if (!category) return res.status(400).json({ error: 'category no válida' });
  if (!name) return res.status(400).json({ error: 'El nombre de la forma es obligatorio (máx. 60 caracteres)' });

  try {
    const shape = await prisma.cakeShape.create({ data: { category, name } });
    res.status(201).json(shape);
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'Ya existe una forma con ese nombre' });
    console.error('Error creando forma:', error);
    res.status(500).json({ error: 'Error al crear la forma' });
  }
}

export async function updateCakeShape(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  const { active } = req.body;
  const data: Prisma.CakeShapeUpdateInput = {};

  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'El nombre de la forma no puede quedar vacío (máx. 60 caracteres)' });
    data.name = name;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active debe ser verdadero o falso' });
    data.active = active;
  }

  try {
    const shape = await prisma.cakeShape.update({ where: { id }, data });
    res.json(shape);
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Forma no encontrada' });
    if (isUniqueViolation(error)) return res.status(409).json({ error: 'Ya existe una forma con ese nombre' });
    console.error('Error editando forma:', error);
    res.status(500).json({ error: 'Error al editar la forma' });
  }
}

export async function deleteCakeShape(req: AuthRequest, res: Response) {
  const id = String(req.params.id);
  try {
    await prisma.cakeShape.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) return res.status(404).json({ error: 'Forma no encontrada' });
    console.error('Error eliminando forma:', error);
    res.status(500).json({ error: 'Error al eliminar la forma' });
  }
}
