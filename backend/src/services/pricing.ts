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

// Pulls the leading portion count out of a variant label like "Torta 10
// porciones" -> 10. Catalog labels aren't fully standardized yet, so this is a
// best-effort parse: no match just means no surcharge table entry applies.
export function extractPortionsFromLabel(label: string): number | null {
  const match = label.match(/(\d+)\s*porcion/i);
  if (!match) return null;
  return Number(match[1]);
}

export function rellenoSurcharge(
  relleno: string | null,
  variantLabel: string,
  isPromo: boolean
): number {
  if (isPromo || !relleno) return 0;
  if (!RELLENOS_PREMIUM.includes(relleno)) return 0;
  const portions = extractPortionsFromLabel(variantLabel);
  if (portions === null) return 0;
  return RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS[portions] ?? 0;
}

// Deposit rule (Aug 2026 rework): an order with exactly one item, and that item
// a minicake (promo variant), requires 100% up front. Everything else — 2+
// items, or a single torta por porciones, or a free/custom line — requires 50%.
export function computeRequiredPaymentPercent(items: { isPromoMinicake: boolean }[]): number {
  if (items.length === 1 && items[0].isPromoMinicake) return 100;
  return 50;
}
