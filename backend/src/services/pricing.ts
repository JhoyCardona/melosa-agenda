// Filling list and deposit-percent rule, shared by the public booking form and
// the admin order form (createPublicOrder / createOrder). Kept as plain
// exported values so both controllers use the exact same numbers — never trust
// a price the client computed and sent back.

export const RELLENOS_BASICOS = ['Vainilla', 'Arequipe', 'Chocolate', 'Frutos rojos'];
export const RELLENOS_PREMIUM = ['Oreo', 'Milo', 'Fresas con crema'];

// Extra charge for a premium filling, keyed by portion count. Only applies to
// tortas sold by porciones (not minicakes, which are locked to Vainilla).
export const RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS: Record<number, number> = {
  5: 5000,
  10: 10000,
  15: 12500,
  20: 15000,
};

// `portions` comes straight from ProductVariant.portions (set explicitly in the
// admin catalog screen) — NOT parsed from the label text. Parsing the label used
// to silently drop the surcharge whenever a catalog entry wasn't labeled with
// the literal word "porciones" (e.g. a variant just labeled "5").
export function rellenoSurcharge(
  relleno: string | null,
  portions: number | null,
  isPromo: boolean
): number {
  if (isPromo || !relleno) return 0;
  if (!RELLENOS_PREMIUM.includes(relleno)) return 0;
  if (portions === null) return 0;
  return RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS[portions] ?? 0;
}

export function isValidRelleno(relleno: string): boolean {
  return RELLENOS_BASICOS.includes(relleno) || RELLENOS_PREMIUM.includes(relleno);
}

// Deposit rule (Aug 2026 rework): an order with exactly one item, and that item
// a minicake (promo variant), requires 100% up front. Everything else — 2+
// items, or a single torta por porciones, or a free/custom line — requires 50%.
export function computeRequiredPaymentPercent(items: { isPromoMinicake: boolean }[]): number {
  if (items.length === 1 && items[0].isPromoMinicake) return 100;
  return 50;
}
