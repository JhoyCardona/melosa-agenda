import { Request, Response } from 'express';
import { PrismaClient, ItemCategory } from '@prisma/client';

const prisma = new PrismaClient();

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
