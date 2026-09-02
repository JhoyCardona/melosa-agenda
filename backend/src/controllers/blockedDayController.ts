import { Response } from 'express';
import { PrismaClient, BlockType } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

const VALID_TYPES = Object.values(BlockType);

function dayDateValue(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function dateStrOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Lists blocked days for a given month, for the app calendars to color cells.
export async function listBlockedDays(req: AuthRequest, res: Response) {
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return res.status(400).json({ error: 'month (1-12) y year son requeridos' });
  }

  try {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const days = await prisma.blockedDay.findMany({
      where: { date: { gte: from, lt: to } },
      orderBy: { date: 'asc' },
    });
    res.json(days.map((d) => ({ date: dateStrOf(d.date), type: d.type })));
  } catch (error) {
    console.error('Error listando días bloqueados:', error);
    res.status(500).json({ error: 'Error al listar los días bloqueados' });
  }
}

// Bulk-creates (or overwrites the type of) a batch of blocked days at once —
// backs the "Agendar vacaciones" / "Bloquear estos días" buttons, which submit
// every day selected on the calendar in a single call.
export async function createBlockedDays(req: AuthRequest, res: Response) {
  const { dates, type } = req.body as { dates?: unknown; type?: string };

  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'dates debe ser un arreglo con al menos una fecha' });
  }
  if (!dates.every((d) => typeof d === 'string' && DATE_RE.test(d))) {
    return res.status(400).json({ error: 'Cada fecha debe tener el formato YYYY-MM-DD' });
  }
  if (!type || !VALID_TYPES.includes(type as BlockType)) {
    return res.status(400).json({ error: `type debe ser uno de: ${VALID_TYPES.join(', ')}` });
  }

  try {
    await prisma.$transaction(
      (dates as string[]).map((dateStr) =>
        prisma.blockedDay.upsert({
          where: { date: dayDateValue(dateStr) },
          create: { date: dayDateValue(dateStr), type: type as BlockType },
          update: { type: type as BlockType },
        })
      )
    );
    res.status(201).json({ blocked: dates.length });
  } catch (error) {
    console.error('Error bloqueando días:', error);
    res.status(500).json({ error: 'Error al bloquear los días' });
  }
}

// Unblocks a single day (tapping an already-blocked day in the app offers this).
export async function deleteBlockedDay(req: AuthRequest, res: Response) {
  const date = String(req.params.date);
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date debe tener el formato YYYY-MM-DD' });
  }

  try {
    await prisma.blockedDay.delete({ where: { date: dayDateValue(date) } }).catch((error) => {
      if (error?.code === 'P2025') return null; // already unblocked, treat as success
      throw error;
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error desbloqueando día:', error);
    res.status(500).json({ error: 'Error al desbloquear el día' });
  }
}
