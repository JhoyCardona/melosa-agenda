// Colombia is UTC-5 year-round (no daylight saving), so the offset is a constant.
const COLOMBIA_UTC_OFFSET_HOURS = 5;

// dateStr must be 'YYYY-MM-DD'. Returns the UTC instant for 23:59:59.999 Colombia
// time on that calendar day (i.e. the actual end of that day for a Colombian user).
export function endOfDayColombia(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  // 23:59:59.999 in UTC-5 == 04:59:59.999 UTC the next day.
  const utcMs =
    Date.UTC(year, month - 1, day + 1, COLOMBIA_UTC_OFFSET_HOURS - 1, 59, 59, 999);
  return new Date(utcMs);
}

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

// Business rule: payment deadline is 2 days before delivery (end of day Colombia
// time), unless that's already too close to (or past) order creation, in which case
// it falls back to 24h from creation instead. So: take the LATER of the two — the
// 24h floor only kicks in when 2-days-before-delivery wouldn't give any real margin.
export function computePaymentDueDate(deliveryDateStr: string, createdAt: Date): Date {
  const twoDaysBeforeDeadline = endOfDayColombia(subtractDays(deliveryDateStr, 2));
  const twentyFourHoursFromCreation = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

  return twoDaysBeforeDeadline > twentyFourHoursFromCreation
    ? twoDaysBeforeDeadline
    : twentyFourHoursFromCreation;
}
