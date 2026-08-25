import { PrismaClient, Prisma, TimeBlock } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;
import { isBusinessDay } from '../utils/colombianHolidays';

const prisma = new PrismaClient();

export const BLOCK_CAPACITY_POINTS = 12;

export const TIME_BLOCKS: { block: TimeBlock; label: string }[] = [
  { block: TimeBlock.SLOT_14_15, label: '2:00pm - 3:00pm' },
  { block: TimeBlock.SLOT_15_16, label: '3:00pm - 4:00pm' },
  { block: TimeBlock.SLOT_16_17, label: '4:00pm - 5:00pm' },
  { block: TimeBlock.SLOT_17_18, label: '5:00pm - 6:00pm' },
  { block: TimeBlock.SLOT_18_19, label: '6:00pm - 7:00pm' },
];

export interface BlockAvailability {
  block: TimeBlock;
  label: string;
  pointsUsed: number;
  pointsAvailable: number;
}

// date must be 'YYYY-MM-DD'. Returns [] for Sundays/holidays (nothing bookable that day).
export async function getDayAvailability(date: string): Promise<BlockAvailability[]> {
  if (!isBusinessDay(date)) return [];

  const usageRows = await prisma.timeSlotUsage.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`) },
  });
  const usedByBlock = new Map(usageRows.map((row) => [row.timeBlock, row.pointsUsed]));

  return TIME_BLOCKS.map(({ block, label }) => {
    const pointsUsed = usedByBlock.get(block) ?? 0;
    return { block, label, pointsUsed, pointsAvailable: BLOCK_CAPACITY_POINTS - pointsUsed };
  });
}

// Throws if the block doesn't have enough free points. Call inside the same
// transaction that creates the Order, so a failed order never reserves points.
export async function reserveSlotPoints(
  tx: TransactionClient,
  date: string,
  block: TimeBlock,
  points: number
) {
  const dateValue = new Date(`${date}T00:00:00.000Z`);

  const existing = await tx.timeSlotUsage.findUnique({
    where: { date_timeBlock: { date: dateValue, timeBlock: block } },
  });
  const currentUsed = existing?.pointsUsed ?? 0;

  if (currentUsed + points > BLOCK_CAPACITY_POINTS) {
    throw new Error(`El bloque ${block} del ${date} no tiene suficiente disponibilidad`);
  }

  await tx.timeSlotUsage.upsert({
    where: { date_timeBlock: { date: dateValue, timeBlock: block } },
    create: { date: dateValue, timeBlock: block, pointsUsed: points },
    update: { pointsUsed: currentUsed + points },
  });
}

// Call when an order is cancelled/expires, to free up its points.
export async function releaseSlotPoints(
  tx: TransactionClient,
  date: string,
  block: TimeBlock,
  points: number
) {
  const dateValue = new Date(`${date}T00:00:00.000Z`);
  const existing = await tx.timeSlotUsage.findUnique({
    where: { date_timeBlock: { date: dateValue, timeBlock: block } },
  });
  if (!existing) return;

  await tx.timeSlotUsage.update({
    where: { date_timeBlock: { date: dateValue, timeBlock: block } },
    data: { pointsUsed: Math.max(0, existing.pointsUsed - points) },
  });
}
