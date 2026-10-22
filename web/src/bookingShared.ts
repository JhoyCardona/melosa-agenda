// Helpers shared by the booking pages (legacy/alfajor and catalog v2 cakes)
// and their common checkout block.

import type { CartItem, Flavor, PrintImageType } from './types';
import { isCakeItem } from './types';

// Mirrors the backend cap (createPublicOrder). Bigger orders go through WhatsApp.
export const MAX_ITEMS = 12;
export const MAX_CLIENT_NAME = 120;

export const PRINT_TYPE_LABELS: Record<PrintImageType, string> = {
  NON_EDIBLE: 'No comestible',
  EDIBLE: 'Comestible',
};

// Shown under the print-type pills: most clients don't know the difference,
// and asking gretica by WhatsApp is exactly what the web is meant to avoid.
export const PRINT_TYPE_HINT =
  'No comestible: impresa en papel, se retira antes de comer. Comestible: impresa en papel de azúcar, se come con la torta.';

export function pesos(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}

export const flavorLabels: Record<Flavor, string> = { VAINILLA: 'Vainilla', CHOCOLATE: 'Chocolate', ALFAJOR: 'Alfajor' };

// Earliest bookable delivery date = today (Colombia, UTC-5) + 2 calendar days,
// i.e. the 48h booking cutoff. The public order endpoint re-checks this.
export function earliestDeliveryDateString(): string {
  const colombiaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  colombiaNow.setUTCDate(colombiaNow.getUTCDate() + 2);
  return colombiaNow.toISOString().slice(0, 10);
}

// "2026-09-01" -> "martes 1 de septiembre". Noon avoids any timezone day-shift.
export function formatDeliveryDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Size line for the WhatsApp message. Legacy labels: "Minicake (2 porciones) ·
// 3 gatos" -> "MiniCake (3 gatos)", anything else -> "Torta <label>". Catalog v2
// cakes use the size's own label as gretica named it.
function whatsappItemLabel(item: CartItem): string {
  if (isCakeItem(item)) return item.sizeLabel;
  const option = item.variantLabel.split(' · ')[1];
  if (item.variantLabel.startsWith('Minicake')) return option ? `MiniCake (${option})` : 'MiniCake';
  return `Torta ${item.variantLabel}`;
}

// Smallest size first so the message reads in a predictable order.
function whatsappSortKey(item: CartItem, label: string): number {
  if (isCakeItem(item)) return item.portions;
  if (label === 'MiniCake' || label.startsWith('MiniCake ')) return 0;
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

// "MiniCake x1\nMulti Personal x1\nTorta 10 porciones x2" — the compact,
// size-only breakdown (not per design/color) that goes into the WhatsApp
// order message.
export function itemsBreakdown(items: CartItem[]): string {
  const counts = new Map<string, { n: number; sort: number }>();
  for (const i of items) {
    const label = whatsappItemLabel(i);
    const prev = counts.get(label);
    counts.set(label, { n: (prev?.n ?? 0) + 1, sort: whatsappSortKey(i, label) });
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => a.sort - b.sort)
    .map(([label, { n }]) => `${label} x${n}`)
    .join('\n');
}

// One-line description of a cart line for the cart list.
export function cartItemSummary(i: CartItem): string {
  const parts = isCakeItem(i)
    ? [i.designName, i.sizeLabel, i.color, `Bizcocho ${i.bizcochoName}`, `Relleno ${i.rellenoName}`, i.shapeName]
    : [i.designName, i.variantLabel, flavorLabels[i.flavor], i.relleno, i.color, i.shape];
  const images = isCakeItem(i) ? i.customImageUrls?.length ?? 0 : i.customImageUrls?.length ?? (i.customImageUrl ? 1 : 0);
  return (
    parts.filter(Boolean).join(' · ') +
    (i.customText ? ` · "${i.customText}"` : '') +
    (images === 1 ? ' · con imagen' : images > 1 ? ` · ${images} imágenes` : '') +
    (i.withoutImages ? ' · sin imagen' : '') +
    (images > 0 && i.printImageType ? (i.printImageType === 'EDIBLE' ? ' comestible' : ' no comestible') : '')
  );
}

// The order payload line for either kind of cart item.
export function toOrderLine(i: CartItem) {
  if (isCakeItem(i)) {
    return {
      productDesignId: i.designId,
      colorId: i.colorId,
      sizeId: i.sizeId,
      bizcochoId: i.bizcochoId,
      rellenoId: i.rellenoId,
      shapeId: i.shapeId,
      customText: i.customText,
      customImageUrls: i.customImageUrls,
      printImageType: i.printImageType,
    };
  }
  return {
    productDesignId: i.designId,
    variantId: i.variantId,
    flavor: i.flavor,
    relleno: i.relleno,
    shape: i.shape,
    color: i.color,
    customText: i.customText,
    customImageUrl: i.customImageUrl,
    customImageUrls: i.customImageUrls,
    printImageType: i.printImageType,
  };
}
