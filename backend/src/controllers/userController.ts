import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

export async function savePushToken(req: AuthRequest, res: Response) {
  const { pushToken } = req.body;

  if (!pushToken) {
    return res.status(400).json({ error: 'pushToken es requerido' });
  }

  try {
    await prisma.user.update({
      where: { id: req.userId as string },
      data: { pushToken },
    });

    res.json({ message: 'Push token guardado correctamente' });
  } catch (error) {
    console.error('Error guardando push token:', error);
    res.status(500).json({ error: 'Error al guardar el push token' });
  }
}