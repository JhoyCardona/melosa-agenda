import { Request, Response } from 'express';
import { PrismaClient, ItemCategory } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

const VALID_CATEGORIES = Object.values(ItemCategory);

interface VariantInput {
  label: string;
  price: number;
  points: number;
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
  const { name, category, shape, imageUrl, allowsCustomImage, variants } = req.body;

  if (!name || !category) {
    return res.status(400).json({ error: 'name y category son requeridos' });
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
  }

  try {
    const design = await prisma.productDesign.create({
      data: {
        name,
        category,
        shape: shape || null,
        imageUrl: imageUrl || null,
        allowsCustomImage: !!allowsCustomImage,
        variants: {
          create: (variants as VariantInput[]).map((v) => ({
            label: v.label,
            price: v.price,
            points: v.points,
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
