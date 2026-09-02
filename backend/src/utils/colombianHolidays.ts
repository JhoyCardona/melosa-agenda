// Colombian public holidays, computed without any external API/dependency.
// Verified against the observed 2026 calendar (colombiacalendario.com) date by date.
//
// Includes the 19-holiday list in effect from 2026 onward: the traditional 18
// (Ley 51 de 1983 / "Ley Emiliani") plus "Nuestra Señora del Rosario de
// Chiquinquirá" (Jul 9, movable), added by Ley 2578 de 2026.
//
// All date math below uses Date.UTC exclusively — never local time — so this
// module's output does not depend on the server's configured timezone.

type HolidayDef =
  | { type: 'fixed'; month: number; day: number; name: string }
  | { type: 'fixedEaster'; offset: number; name: string }
  | { type: 'movable'; month: number; day: number; name: string }
  | { type: 'movableEaster'; offset: number; name: string };

const HOLIDAY_DEFS: HolidayDef[] = [
  { type: 'fixed', month: 1, day: 1, name: 'Año Nuevo' },
  { type: 'movable', month: 1, day: 6, name: 'Día de los Reyes Magos' },
  { type: 'movable', month: 3, day: 19, name: 'Día de San José' },
  { type: 'fixedEaster', offset: -3, name: 'Jueves Santo' },
  { type: 'fixedEaster', offset: -2, name: 'Viernes Santo' },
  { type: 'fixed', month: 5, day: 1, name: 'Día del Trabajo' },
  { type: 'movableEaster', offset: 39, name: 'Ascensión del Señor' },
  { type: 'movableEaster', offset: 60, name: 'Corpus Christi' },
  { type: 'movableEaster', offset: 68, name: 'Sagrado Corazón de Jesús' },
  { type: 'movable', month: 6, day: 29, name: 'San Pedro y San Pablo' },
  // Ley 2578 de 2026
  { type: 'movable', month: 7, day: 9, name: 'Nuestra Señora del Rosario de Chiquinquirá' },
  { type: 'fixed', month: 7, day: 20, name: 'Día de la Independencia' },
  { type: 'fixed', month: 8, day: 7, name: 'Batalla de Boyacá' },
  { type: 'movable', month: 8, day: 15, name: 'Asunción de la Virgen' },
  { type: 'movable', month: 10, day: 12, name: 'Día de la Raza' },
  { type: 'movable', month: 11, day: 1, name: 'Día de Todos los Santos' },
  { type: 'movable', month: 11, day: 11, name: 'Independencia de Cartagena' },
  { type: 'fixed', month: 12, day: 8, name: 'Inmaculada Concepción' },
  { type: 'fixed', month: 12, day: 25, name: 'Navidad' },
];

interface YMD {
  year: number;
  month: number;
  day: number;
}

function addDays({ year, month, day }: YMD, offsetDays: number): YMD {
  const utcMs = Date.UTC(year, month - 1, day) + offsetDays * 86_400_000;
  const d = new Date(utcMs);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeek({ year, month, day }: YMD): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sunday..6=Saturday
}

function nextMonday(date: YMD): YMD {
  const dow = dayOfWeek(date);
  if (dow === 1) return date;
  const daysToAdd = dow === 0 ? 1 : 8 - dow;
  return addDays(date, daysToAdd);
}

// Meeus/Jones/Butcher Gregorian Easter algorithm.
function getEasterSunday(year: number): YMD {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function resolveHoliday(def: HolidayDef, year: number, easter: YMD): YMD {
  switch (def.type) {
    case 'fixed':
      return { year, month: def.month, day: def.day };
    case 'fixedEaster':
      return addDays(easter, def.offset);
    case 'movable':
      return nextMonday({ year, month: def.month, day: def.day });
    case 'movableEaster':
      return nextMonday(addDays(easter, def.offset));
  }
}

function toDateString({ year, month, day }: YMD): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface ColombianHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

const holidaysByYearCache = new Map<number, ColombianHoliday[]>();

export function getColombianHolidays(year: number): ColombianHoliday[] {
  const cached = holidaysByYearCache.get(year);
  if (cached) return cached;

  const easter = getEasterSunday(year);
  const holidays = HOLIDAY_DEFS.map((def) => ({
    date: toDateString(resolveHoliday(def, year, easter)),
    name: def.name,
  })).sort((a, b) => a.date.localeCompare(b.date));

  holidaysByYearCache.set(year, holidays);
  return holidays;
}

// dateStr must be 'YYYY-MM-DD', interpreted as a plain calendar date (no timezone conversion).
export function isColombianHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  return getColombianHolidays(year).some((h) => h.date === dateStr);
}

export function isBusinessDay(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = dayOfWeek({ year, month, day });
  const isSunday = weekday === 0;
  const isMonday = weekday === 1;
  return !isSunday && !isMonday && !isColombianHoliday(dateStr);
}
