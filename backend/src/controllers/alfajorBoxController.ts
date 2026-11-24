import { Response } from 'express';
import { PrismaClient, ItemCategory, Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';
import { MAX_ALFAJORES_PER_PUBLIC_ORDER } from '../services/limits';

const prisma = new PrismaClient();

// Backs the admin "Cajas y cantidades" screen of small alfajores: the global
// quantities (x6, x15…, with their packing minutes) and box decorations
// (Clásica, Navideña…, each with a photo and a price per quantity × alfajor
// size). Every flavor shares them. All routes are admin-only. New rows start
// inactive so a half-configured box never reaches the public page.

const TX_OPTIONS = { timeout: 15000, maxWait: 10000 };
const MAX_PREP_MINUTES = 390;

function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= 60 ? name : null;
}

function prismaCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}

function cleanImageUrl(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return typeof v === 'string' && /^https:\/\/\S+$/.test(v) ? v : undefined;
}

// GET /alfajor-boxes — quantities, boxes with their prices, and the alfajor
// sizes (all of them, active or not, so the price grid can say which are off).
export async function getAlfajorBoxes(req: AuthRequest, res: Response) {
  try {
    const [quantities, boxes, sizes] = await Promise.all([
      prisma.alfajorQuantity.findMany({ orderBy: { units: 'asc' } }),
      prisma.alfajorBox.findMany({ orderBy: { createdAt: 'asc' }, include: { prices: true } }),
      prisma.cakeSize.findMany({ where: { category: ItemCategory.ALFAJOR_UNIT }, orderBy: { portions: 'asc' } }),
    ]);
    res.json({
      quantities: quantities.map((q) => ({ id: q.id, units: q.units, prepMinutes: q.prepMinutes, active: q.active })),
      boxes: boxes.map((b) => {
        const prices: Record<string, Record<string, number>> = {};
        for (const p of b.prices) (prices[p.quantityId] ??= {})[p.sizeId] = Number(p.price);
        return { id: b.id, name: b.name, imageUrl: b.imageUrl, active: b.active, prices };
      }),
      sizes: sizes.map((s) => ({ id: s.id, label: s.label, active: s.active })),
    });
  } catch (error) {
    console.error('Error cargando cajas de alfajores:', error);
    res.status(500).json({ error: 'No se pudieron cargar las cajas' });
  }
}

// POST /alfajor-boxes/quantities { units, prepMinutes }
export async function createAlfajorQuantity(req: AuthRequest, res: Response) {
  const { units, prepMinutes } = req.body ?? {};
  if (!isIntIn(units, 1, MAX_ALFAJORES_PER_PUBLIC_ORDER)) {
    return res.status(400).json({ error: `La cantidad debe ser un número entre 1 y ${MAX_ALFAJORES_PER_PUBLIC_ORDER}` });
  }
  if (!isIntIn(prepMinutes, 1, MAX_PREP_MINUTES)) {
    return res.status(400).json({ error: `Los minutos deben ser un número entre 1 y ${MAX_PREP_MINUTES}` });
  }
  try {
    const created = await prisma.alfajorQuantity.create({ data: { units, prepMinutes } });
    res.status(201).json(created);
  } catch (error) {
    if (prismaCode(error) === 'P2002') return res.status(409).json({ error: `Ya existe la cantidad x${units}` });
    console.error('Error creando cantidad de alfajores:', error);
    res.status(500).json({ error: 'No se pudo crear la cantidad' });
  }
}

// PATCH /alfajor-boxes/quantities/:id { units?, prepMinutes?, active? }
export async function updateAlfajorQuantity(req: AuthRequest, res: Response) {
  const { units, prepMinutes, active } = req.body ?? {};
  const data: Prisma.AlfajorQuantityUpdateInput = {};
  if (units !== undefined) {
    if (!isIntIn(units, 1, MAX_ALFAJORES_PER_PUBLIC_ORDER)) {
      return res.status(400).json({ error: `La cantidad debe ser un número entre 1 y ${MAX_ALFAJORES_PER_PUBLIC_ORDER}` });
    }
    data.units = units;
  }
  if (prepMinutes !== undefined) {
    if (!isIntIn(prepMinutes, 1, MAX_PREP_MINUTES)) {
      return res.status(400).json({ error: `Los minutos deben ser un número entre 1 y ${MAX_PREP_MINUTES}` });
    }
    data.prepMinutes = prepMinutes;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active debe ser verdadero o falso' });
    data.active = active;
  }
  try {
    res.json(await prisma.alfajorQuantity.update({ where: { id: String(req.params.id) }, data }));
  } catch (error) {
    if (prismaCode(error) === 'P2002') return res.status(409).json({ error: 'Ya existe esa cantidad' });
    if (prismaCode(error) === 'P2025') return res.status(404).json({ error: 'La cantidad ya no existe' });
    console.error('Error editando cantidad de alfajores:', error);
    res.status(500).json({ error: 'No se pudo editar la cantidad' });
  }
}

// DELETE /alfajor-boxes/quantities/:id — also drops its box prices. Booked
// orders keep their text snapshot, so history is untouched.
export async function deleteAlfajorQuantity(req: AuthRequest, res: Response) {
  try {
    await prisma.alfajorQuantity.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (error) {
    if (prismaCode(error) === 'P2025') return res.status(404).json({ error: 'La cantidad ya no existe' });
    console.error('Error eliminando cantidad de alfajores:', error);
    res.status(500).json({ error: 'No se pudo eliminar la cantidad' });
  }
}

// POST /alfajor-boxes/boxes { name, imageUrl? }
export async function createAlfajorBox(req: AuthRequest, res: Response) {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Escribe el nombre de la caja (máximo 60 letras)' });
  const imageUrl = cleanImageUrl(req.body?.imageUrl);
  try {
    const created = await prisma.alfajorBox.create({ data: { name, imageUrl: imageUrl ?? null } });
    res.status(201).json(created);
  } catch (error) {
    if (prismaCode(error) === 'P2002') return res.status(409).json({ error: 'Ya existe una caja con ese nombre' });
    console.error('Error creando caja de alfajores:', error);
    res.status(500).json({ error: 'No se pudo crear la caja' });
  }
}

// PATCH /alfajor-boxes/boxes/:id { name?, imageUrl?, active? }
export async function updateAlfajorBox(req: AuthRequest, res: Response) {
  const body = req.body ?? {};
  const data: Prisma.AlfajorBoxUpdateInput = {};
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return res.status(400).json({ error: 'Escribe el nombre de la caja (máximo 60 letras)' });
    data.name = name;
  }
  if (body.imageUrl !== undefined) {
    const imageUrl = cleanImageUrl(body.imageUrl);
    if (imageUrl === undefined) return res.status(400).json({ error: 'La foto no es válida' });
    data.imageUrl = imageUrl;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return res.status(400).json({ error: 'active debe ser verdadero o falso' });
    data.active = body.active;
  }
  try {
    res.json(await prisma.alfajorBox.update({ where: { id: String(req.params.id) }, data }));
  } catch (error) {
    if (prismaCode(error) === 'P2002') return res.status(409).json({ error: 'Ya existe una caja con ese nombre' });
    if (prismaCode(error) === 'P2025') return res.status(404).json({ error: 'La caja ya no existe' });
    console.error('Error editando caja de alfajores:', error);
    res.status(500).json({ error: 'No se pudo editar la caja' });
  }
}

// DELETE /alfajor-boxes/boxes/:id
export async function deleteAlfajorBox(req: AuthRequest, res: Response) {
  try {
    await prisma.alfajorBox.delete({ where: { id: String(req.params.id) } });
    res.status(204).end();
  } catch (error) {
    if (prismaCode(error) === 'P2025') return res.status(404).json({ error: 'La caja ya no existe' });
    console.error('Error eliminando caja de alfajores:', error);
    res.status(500).json({ error: 'No se pudo eliminar la caja' });
  }
}

// PUT /alfajor-boxes/boxes/:id/prices { prices: { quantityId: { sizeId: price } } }
// Replaces the box's whole price grid: a combination left out isn't offered.
export async function setAlfajorBoxPrices(req: AuthRequest, res: Response) {
  const boxId = String(req.params.id);
  const raw = req.body?.prices;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return res.status(400).json({ error: 'prices debe ser un objeto' });
  }
  const rows: { quantityId: string; sizeId: string; price: number }[] = [];
  for (const [quantityId, bySize] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof bySize !== 'object' || bySize === null || Array.isArray(bySize)) {
      return res.status(400).json({ error: 'Precios mal formados' });
    }
    for (const [sizeId, price] of Object.entries(bySize as Record<string, unknown>)) {
      // 0 is allowed: a box that's included in the alfajor price.
      if (!isIntIn(price, 0, 10_000_000)) return res.status(400).json({ error: 'Cada precio debe ser un número en pesos' });
      rows.push({ quantityId, sizeId, price });
    }
  }
  try {
    const quantityIds = [...new Set(rows.map((r) => r.quantityId))];
    const sizeIds = [...new Set(rows.map((r) => r.sizeId))];
    const [box, qCount, sCount] = await Promise.all([
      prisma.alfajorBox.findUnique({ where: { id: boxId } }),
      prisma.alfajorQuantity.count({ where: { id: { in: quantityIds } } }),
      prisma.cakeSize.count({ where: { id: { in: sizeIds }, category: ItemCategory.ALFAJOR_UNIT } }),
    ]);
    if (!box) return res.status(404).json({ error: 'La caja ya no existe' });
    if (qCount !== quantityIds.length || sCount !== sizeIds.length) {
      return res.status(400).json({ error: 'Alguna cantidad o tamaño ya no existe; recarga la página' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.alfajorBoxPrice.deleteMany({ where: { boxId } });
      if (rows.length > 0) await tx.alfajorBoxPrice.createMany({ data: rows.map((r) => ({ boxId, ...r })) });
    }, TX_OPTIONS);
    res.status(204).end();
  } catch (error) {
    console.error('Error guardando precios de caja de alfajores:', error);
    res.status(500).json({ error: 'No se pudieron guardar los precios' });
  }
}
