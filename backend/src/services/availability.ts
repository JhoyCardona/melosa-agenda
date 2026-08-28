import { PrismaClient, Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;
import { isBusinessDay } from '../utils/colombianHolidays';

const prisma = new PrismaClient();

// Delivery window: 2:00pm-7:00pm, expressed as minutes from MIDNIGHT (so admin
// orders can use any clock time without negative offsets).
export const OPEN_MINUTE = 840; // 2:00 p.m.
export const CLOSE_MINUTE = 1140; // 7:00 p.m.
// Assigned pickup times are rounded up to the next multiple of this, so times
// stay clean (2:20, 3:40 — never 3:17).
export const ROUND_TO_MINUTES = 5;

// Substring used both in the client-facing message and by isNotEnoughRoomError to
// recognise this specific failure. Keep it human-readable.
const NOT_ENOUGH_ROOM = 'ya no tiene espacio';

export function ceilToStep(minutes: number, step: number = ROUND_TO_MINUTES): number {
  return Math.ceil(minutes / step) * step;
}

// minutes-from-midnight -> "3:40 p.m."
export function minutesToLabel(minutesFromMidnight: number): string {
  let hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const meridiem = hour >= 12 ? 'p.m.' : 'a.m.';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

function dayDateValue(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export interface DeliveryPreview {
  isBusinessDay: boolean;
  // Present only when isBusinessDay is true:
  deliveryStartMinutes?: number;
  deliveryDurationMin?: number;
  deliveryEndMinutes?: number;
  deliveryTimeLabel?: string;
  closesAtLabel?: string;
  fits?: boolean;
}

// What pickup time an order of `durationMin` minutes would get on `dateStr`, and
// whether it still fits before closing. Read-only preview for the public form —
// the authoritative assignment happens in reserveDeliverySlot inside the
// order-creation transaction.
export async function getDeliveryPreview(
  dateStr: string,
  durationMin: number
): Promise<DeliveryPreview> {
  if (!isBusinessDay(dateStr)) return { isBusinessDay: false };

  const day = await prisma.daySchedule.findUnique({ where: { date: dayDateValue(dateStr) } });
  const cursor = day?.cursorMinutes ?? OPEN_MINUTE;

  const rounded = ceilToStep(Math.max(0, durationMin));
  const start = cursor;
  const end = start + rounded;

  return {
    isBusinessDay: true,
    deliveryStartMinutes: start,
    deliveryDurationMin: rounded,
    deliveryEndMinutes: end,
    deliveryTimeLabel: minutesToLabel(end),
    closesAtLabel: minutesToLabel(CLOSE_MINUTE),
    fits: end <= CLOSE_MINUTE,
  };
}

export interface ReservedSlot {
  startMinutes: number;
  durationMin: number;
  endMinutes: number;
}

// Assigns a slot on the day's timeline and advances the cursor. Call inside the
// same transaction that creates/updates the Order, so a failed order never
// advances the cursor.
//
// - Without explicitStartMin: append at the end of the queue (the normal path).
// - With explicitStartMin: place at a fixed start (used when seeding the backlog
//   of orders Melosa already promised times for). The cursor still only moves
//   forward — never back.
export async function reserveDeliverySlot(
  tx: TransactionClient,
  dateStr: string,
  durationMin: number,
  explicitStartMin?: number
): Promise<ReservedSlot> {
  const rounded = ceilToStep(Math.max(0, durationMin));
  const date = dayDateValue(dateStr);

  // Serialise all slot reservations for the same day. Without this, two clients
  // booking the same day in the same instant both read the same cursor and land
  // on the same pickup time. pg_advisory_xact_lock is released automatically when
  // the surrounding transaction ends.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dateStr}))`;

  const existing = await tx.daySchedule.findUnique({ where: { date } });
  const cursor = existing?.cursorMinutes ?? OPEN_MINUTE;

  const start = explicitStartMin ?? cursor;
  const end = start + rounded;

  if (start < OPEN_MINUTE || end > CLOSE_MINUTE) {
    throw new Error(
      `Ese día ${NOT_ENOUGH_ROOM} para tu pedido (entregamos hasta las ${minutesToLabel(
        CLOSE_MINUTE
      )}). Elige otra fecha.`
    );
  }

  const newCursor = Math.max(cursor, end);
  await tx.daySchedule.upsert({
    where: { date },
    create: { date, cursorMinutes: newCursor },
    update: { cursorMinutes: newCursor },
  });

  return { startMinutes: start, durationMin: rounded, endMinutes: end };
}

export function isNotEnoughRoomError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(NOT_ENOUGH_ROOM);
}
