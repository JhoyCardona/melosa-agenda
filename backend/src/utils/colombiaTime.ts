// Colombia is UTC-5 year-round (no daylight saving), so the offset is a constant.
const COLOMBIA_UTC_OFFSET_HOURS = 5;

// dateStr must be 'YYYY-MM-DD'. Subtracts `days` calendar days (no timezone math needed
// since we only shift the date part, before reinterpreting it in Colombia time).
export function subtractDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day - days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

// Returns the current instant converted to a Colombia 'YYYY-MM-DD' calendar date,
// used to compare "today" against dates stored as plain calendar days.
export function todayColombiaDateString(now: Date = new Date()): string {
  const colombiaMs = now.getTime() - COLOMBIA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const d = new Date(colombiaMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

// Business rule (Aug 2026): a client must pay at least 24h before their pickup
// time, or the order expires. `pickupMinutesFromMidnight` is the order's assigned
// pickup slot (deliveryStartMinutes + deliveryDurationMin) on `deliveryDateStr`,
// read as a Colombia wall-clock time. There is no "24h from creation" floor
// anymore: the 48h booking cutoff (see earliestPublicDeliveryDate) already
// guarantees at least 24h of margin to pay.
export function computePaymentDueDate(
  deliveryDateStr: string,
  pickupMinutesFromMidnight: number
): Date {
  const [year, month, day] = deliveryDateStr.slice(0, 10).split('-').map(Number);
  const hour = Math.floor(pickupMinutesFromMidnight / 60);
  const minute = pickupMinutesFromMidnight % 60;
  // Colombia local time -> UTC instant: add the constant 5h offset.
  const pickupUtcMs = Date.UTC(year, month - 1, day, hour + COLOMBIA_UTC_OFFSET_HOURS, minute);
  return new Date(pickupUtcMs - 24 * 60 * 60 * 1000);
}

// Earliest delivery date a public client may book: today (Colombia) + 2 calendar
// days, i.e. ~48h of lead time. Returned as 'YYYY-MM-DD'. This is the floor the
// booking form's date picker and the public order endpoint both enforce.
export function earliestPublicDeliveryDate(now: Date = new Date()): string {
  return subtractDays(todayColombiaDateString(now), -2);
}
