import { useEffect, useState } from 'react';
import { getWithRetry } from './api';
import { rellenoSurcharge } from './config';
import type {
  CakeCartItem,
  CartItem,
  LegacyCartItem,
  PrintImageType,
  ProductDesign,
  PublicCakeCatalog,
  PublicCakeSize,
} from './types';
import { isCakeItem } from './types';

// Re-checks saved cart lines against the live catalog, so a line whose
// design, option or price changed since it was added is dropped with a warning
// instead of failing on submit. Shared by the booking pages and the cart page.

// Price of one cake as configured: this color's size price + the chosen
// flavors' surcharges for that size + the print-image surcharge, if any.
export function cakeLinePrice(
  catalog: PublicCakeCatalog,
  size: PublicCakeSize,
  bizcochoId: string,
  rellenoId: string,
  printImageType?: PrintImageType
): number {
  const extra = (flavorId: string) =>
    catalog.flavors.find((f) => f.id === flavorId)?.surcharges[size.sizeId] ?? 0;
  const imageExtra = printImageType ? catalog.printImagePrices[printImageType] : 0;
  return size.price + extra(bizcochoId) + extra(rellenoId) + imageExtra;
}

// Is a saved cake line still valid against the live catalog, at the same price?
export function cakeItemStillValid(catalog: PublicCakeCatalog, item: CakeCartItem): boolean {
  const design = catalog.designs.find((d) => d.id === item.designId);
  const color = design?.colors.find((c) => c.id === item.colorId);
  const size = color?.sizes.find((s) => s.sizeId === item.sizeId);
  if (!color || !size) return false;
  if (!color.bizcochoIds.includes(item.bizcochoId) || !color.rellenoIds.includes(item.rellenoId)) return false;
  if (!color.shapes.some((s) => s.id === item.shapeId)) return false;
  const printType = item.customImageUrls?.length ? item.printImageType ?? 'NON_EDIBLE' : undefined;
  return cakeLinePrice(catalog, size, item.bizcochoId, item.rellenoId, printType) === item.price;
}

// Same check for a legacy line (alfajor cake): design and variant still
// exist and the price matches. Without print prices, a line with images
// can't be re-priced and counts as stale.
export function legacyItemStillValid(
  designs: ProductDesign[],
  printPrices: Record<PrintImageType, number> | null,
  item: LegacyCartItem
): boolean {
  const d = designs.find((x) => x.id === item.designId);
  const v = d?.variants.find((x) => x.id === item.variantId);
  if (!d || !v) return false;
  const hasImages = !!item.customImageUrl || (item.customImageUrls?.length ?? 0) > 0;
  const imageExtra = hasImages && item.printImageType ? printPrices?.[item.printImageType] ?? NaN : 0;
  const expected = Number(v.price) + rellenoSurcharge(item.relleno, v.portions, v.enPromocion) + imageExtra;
  return Math.round(expected) === Math.round(item.price);
}

// Validates the whole cart once on mount (cake and legacy lines), fetching
// only the catalogs it needs. Lines kept from an order being modified keep
// their booked price, so they're never checked. Returns true once lines were
// dropped, for the "el catálogo cambió" warning.
export function useCartRevalidation(
  items: CartItem[],
  setItems: (items: CartItem[]) => void
): boolean {
  const [wasStale, setWasStale] = useState(false);

  useEffect(() => {
    const checkable = items.filter((i) => !i.keepItemId);
    const hasCakes = checkable.some(isCakeItem);
    const hasLegacy = checkable.some((i) => !isCakeItem(i));
    if (!hasCakes && !hasLegacy) return;

    Promise.all([
      hasCakes ? getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog') : null,
      hasLegacy ? getWithRetry<ProductDesign[]>('/product-designs') : null,
      hasLegacy
        ? getWithRetry<Record<PrintImageType, number>>('/public-orders/print-image-prices').catch(() => null)
        : null,
    ])
      .then(([cakeCatalog, designs, printPrices]) => {
        const kept = items.filter((i) => {
          if (i.keepItemId) return true;
          if (isCakeItem(i)) return !cakeCatalog || cakeItemStillValid(cakeCatalog, i);
          return !designs || legacyItemStillValid(designs, printPrices, i);
        });
        if (kept.length !== items.length) {
          setItems(kept);
          setWasStale(true);
        }
      })
      // Can't reach the catalog: leave the cart alone, the server re-validates
      // on submit anyway.
      .catch((err) => console.error('Error revisando el pedido:', err));
    // Runs once on mount, validating the cart as loaded from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return wasStale;
}
