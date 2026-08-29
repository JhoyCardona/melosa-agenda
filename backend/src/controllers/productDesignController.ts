import { Request, Response } from 'express';
import { PrismaClient, ItemCategory } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

const VALID_CATEGORIES = Object.values(ItemCategory);

interface VariantInput {
  label: string;
  price: number;
  points: number;
  prepMinutes?: number;
  portions?: number;
  enPromocion?: boolean;
}

// Admin-only listing (behind authMiddleware) — unlike the public catalog below,
// this returns every category, including ones not enabled for scheduling yet, so
// Melosa can see everything she's already loaded from the catalog screen.
export async function listAllProductDesigns(req: AuthRequest, res: Response) {
  try {
    const designs = await prisma.productDesign.findMany({
      include: { variants: { orderBy: { points: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(designs);
  } catch (error) {
    console.error('Error listando catálogo (admin):', error);
    res.status(500).json({ error: 'Error al listar el catálogo' });
  }
}

// Fase 1 leftover: lets Melosa load a new product design (with its size/variant
// list) from the web, behind the same login the mobile app uses — no polished
// editing yet, just create.
export async function createProductDesign(req: AuthRequest, res: Response) {
  const { name, category, shape, imageUrl, allowsCustomImage, allowsCustomText, variants } = req.body;

  if (!name || !category) {
    return res.status(400).json({ error: 'name y category son requeridos' });
  }
  if (!shape || !String(shape).trim()) {
    return res.status(400).json({ error: 'shape es requerido' });
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category debe ser una de: ${VALID_CATEGORIES.join(', ')}` });
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: 'variants debe ser un arreglo con al menos un tamaño' });
  }

  for (const variant of variants as VariantInput[]) {
    if (!variant.label || variant.price === undefined || variant.points === undefined) {
      return res.status(400).json({ error: 'Cada variante necesita label, price y points' });
    }
    const priceErr = validatePositivePrice(variant.price);
    if (priceErr) return res.status(400).json({ error: priceErr });
    const pointsErr = validatePositiveInt(variant.points, 'points');
    if (pointsErr) return res.status(400).json({ error: pointsErr });
    if (variant.prepMinutes !== undefined) {
      const err = validatePrepMinutes(variant.prepMinutes);
      if (err) return res.status(400).json({ error: err });
    }
    if (variant.portions !== undefined) {
      const err = validatePositiveInt(variant.portions, 'portions');
      if (err) return res.status(400).json({ error: err });
    }
  }

  try {
    const design = await prisma.productDesign.create({
      data: {
        name,
        category,
        shape: String(shape).trim(),
        imageUrl: imageUrl || null,
        allowsCustomImage: !!allowsCustomImage,
        allowsCustomText: allowsCustomText === undefined ? true : !!allowsCustomText,
        variants: {
          create: (variants as VariantInput[]).map((v) => ({
            label: v.label,
            price: v.price,
            points: v.points,
            ...(v.prepMinutes !== undefined && { prepMinutes: v.prepMinutes }),
            ...(v.portions !== undefined && { portions: v.portions }),
            enPromocion: !!v.enPromocion,
          })),
        },
      },
      include: { variants: true },
    });

    res.status(201).json(design);
  } catch (error) {
    console.error('Error creando diseño de producto:', error);
    res.status(500).json({ error: 'Error al crear el diseño de producto' });
  }
}

function validatePrepMinutes(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return 'prepMinutes debe ser un entero mayor a 0';
  }
  return null;
}

function validatePositiveInt(value: unknown, field: string): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return `${field} debe ser un entero mayor a 0`;
  }
  return null;
}

function validatePositivePrice(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'price debe ser un número mayor a 0';
  }
  return null;
}

// Fase 6: edit an existing design's own fields (not its variants).
export async function updateProductDesign(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { name, category, shape, imageUrl, allowsCustomImage, allowsCustomText } = req.body;

  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category debe ser una de: ${VALID_CATEGORIES.join(', ')}` });
  }
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'name no puede quedar vacío' });
  }
  if (shape !== undefined && !String(shape).trim()) {
    return res.status(400).json({ error: 'shape no puede quedar vacío' });
  }

  try {
    const design = await prisma.productDesign.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(category !== undefined && { category }),
        ...(shape !== undefined && { shape: String(shape).trim() }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(allowsCustomImage !== undefined && { allowsCustomImage: !!allowsCustomImage }),
        ...(allowsCustomText !== undefined && { allowsCustomText: !!allowsCustomText }),
      },
      include: { variants: { orderBy: { points: 'asc' } } },
    });
    res.json(design);
  } catch (error) {
    console.error('Error actualizando diseño:', error);
    res.status(500).json({ error: 'Error al actualizar el diseño' });
  }
}

// Fase 6c: delete a design (and its variants, cascade) — blocked if any order
// already references one of its variants, so history stays intact.
export async function deleteProductDesign(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  try {
    const design = await prisma.productDesign.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!design) return res.status(404).json({ error: 'Diseño no encontrado' });

    if (design._count.orderItems > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: hay pedidos que usan este producto',
      });
    }

    await prisma.productDesign.delete({ where: { id } });
    res.json({ message: 'Producto eliminado' });
  } catch (error) {
    console.error('Error eliminando diseño:', error);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
}

// Fase 6: add a size/variant to an existing design.
export async function addProductVariant(req: AuthRequest, res: Response) {
  const designId = req.params.id as string;
  const { label, price, points, prepMinutes, portions, enPromocion } = req.body;

  if (!label || price === undefined || points === undefined) {
    return res.status(400).json({ error: 'label, price y points son requeridos' });
  }
  const priceErr = validatePositivePrice(price);
  if (priceErr) return res.status(400).json({ error: priceErr });
  const pointsErr = validatePositiveInt(points, 'points');
  if (pointsErr) return res.status(400).json({ error: pointsErr });
  if (prepMinutes !== undefined) {
    const err = validatePrepMinutes(prepMinutes);
    if (err) return res.status(400).json({ error: err });
  }
  if (portions !== undefined) {
    const err = validatePositiveInt(portions, 'portions');
    if (err) return res.status(400).json({ error: err });
  }

  try {
    const design = await prisma.productDesign.findUnique({ where: { id: designId } });
    if (!design) return res.status(404).json({ error: 'Diseño no encontrado' });

    const variant = await prisma.productVariant.create({
      data: {
        productDesignId: designId,
        label,
        price,
        points,
        ...(prepMinutes !== undefined && { prepMinutes }),
        ...(portions !== undefined && { portions }),
        enPromocion: !!enPromocion,
      },
    });
    res.status(201).json(variant);
  } catch (error) {
    console.error('Error agregando variante:', error);
    res.status(500).json({ error: 'Error al agregar la variante' });
  }
}

// Fase 6: edit an existing variant (price, label, points, minutes, promo flag).
export async function updateProductVariant(req: AuthRequest, res: Response) {
  const variantId = req.params.variantId as string;
  const { label, price, points, prepMinutes, portions, enPromocion } = req.body;

  if (label !== undefined && !String(label).trim()) {
    return res.status(400).json({ error: 'label no puede quedar vacío' });
  }
  if (prepMinutes !== undefined) {
    const err = validatePrepMinutes(prepMinutes);
    if (err) return res.status(400).json({ error: err });
  }
  if (price !== undefined) {
    const err = validatePositivePrice(price);
    if (err) return res.status(400).json({ error: err });
  }
  if (points !== undefined) {
    const err = validatePositiveInt(points, 'points');
    if (err) return res.status(400).json({ error: err });
  }
  if (portions !== undefined && portions !== null) {
    const err = validatePositiveInt(portions, 'portions');
    if (err) return res.status(400).json({ error: err });
  }

  try {
    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(label !== undefined && { label: String(label).trim() }),
        ...(price !== undefined && { price }),
        ...(points !== undefined && { points }),
        ...(prepMinutes !== undefined && { prepMinutes }),
        ...(portions !== undefined && { portions }),
        ...(enPromocion !== undefined && { enPromocion: !!enPromocion }),
      },
    });
    res.json(variant);
  } catch (error) {
    console.error('Error actualizando variante:', error);
    res.status(500).json({ error: 'Error al actualizar la variante' });
  }
}

// Fase 6: remove a variant. Blocked if it's the design's last one, or if any
// order already uses it (kept for history).
export async function deleteProductVariant(req: AuthRequest, res: Response) {
  const variantId = req.params.variantId as string;

  try {
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!variant) return res.status(404).json({ error: 'Variante no encontrada' });

    if (variant._count.orderItems > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar: hay pedidos que usan este tamaño',
      });
    }

    const siblingCount = await prisma.productVariant.count({
      where: { productDesignId: variant.productDesignId },
    });
    if (siblingCount <= 1) {
      return res.status(409).json({ error: 'Un diseño debe tener al menos un tamaño' });
    }

    await prisma.productVariant.delete({ where: { id: variantId } });
    res.json({ message: 'Variante eliminada' });
  } catch (error) {
    console.error('Error eliminando variante:', error);
    res.status(500).json({ error: 'Error al eliminar la variante' });
  }
}

// Public catalog read — used by the mobile app's "add order" flow today, and by
// the public web form later (Fase 2). Only CAKE is enabled for scheduling so far
// (cupcakes/alfajores points are still pending per CLAUDE.md).
export async function listProductDesigns(req: Request, res: Response) {
  try {
    const designs = await prisma.productDesign.findMany({
      where: { category: ItemCategory.CAKE },
      include: { variants: { orderBy: { points: 'asc' } } },
      orderBy: { name: 'asc' },
    });

    res.json(designs);
  } catch (error) {
    console.error('Error listando catálogo:', error);
    res.status(500).json({ error: 'Error al listar el catálogo' });
  }
}
