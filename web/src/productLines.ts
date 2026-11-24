// Every product line Melosa sells, in display order. Shared by the header's
// "Productos" menu and the home "Nuestros productos" grid. A line without an
// href isn't bookable yet (no photos or business rules decided) and shows as
// "Próximamente". A line with `catalogCategory` also shows as "Próximamente"
// in the header menu while its catalog has no bookable product (see
// loadEmptyLines); the home grid does the same with its own catalog data.

import type { CatalogCategory } from './types';

// Stable link to the alfajor cake: its design id lives in the database, so
// this route looks it up and redirects (see AlfajorRedirect).
export const ALFAJOR_HREF = '/alfajor';

// Small alfajores in boxes ("Antojo de alfajores").
export const ALFAJORES_HREF = '/catalogo-alfajores';

// Cupcake boxes (x3, x6, x12).
export const CUPCAKES_HREF = '/catalogo-cupcakes';

export interface ProductLine {
  key: string;
  name: string;
  href?: string;
  // Catalog v2 line to check: no bookable product yet → "Próximamente".
  catalogCategory?: CatalogCategory;
}

export const PRODUCT_LINES: ProductLine[] = [
  { key: 'cakes', name: 'Cakes', href: '/catalogo' },
  { key: 'alfajor', name: 'Cakes de alfajor', href: ALFAJOR_HREF },
  { key: 'cupcakes', name: 'Cupcakes', href: CUPCAKES_HREF, catalogCategory: 'CUPCAKE' },
  { key: 'alfajores', name: 'Alfajores', href: ALFAJORES_HREF, catalogCategory: 'ALFAJOR_UNIT' },
  { key: 'postres', name: 'Postres' },
];

// Keys of the lines (with catalogCategory) whose catalog has no bookable
// product. Fetched once per page load, and only when first asked (the header
// asks when its "Productos" menu opens), so pages that never open the menu
// pay nothing. A failed fetch counts the line as available: better a link to
// an empty catalog than hiding a line that has products.
let emptyLinesPromise: Promise<Set<string>> | null = null;

export function loadEmptyLines(
  fetchCatalog: (category: CatalogCategory) => Promise<{ designs: unknown[] }>
): Promise<Set<string>> {
  emptyLinesPromise ??= Promise.all(
    PRODUCT_LINES.filter((l) => l.catalogCategory).map((l) =>
      fetchCatalog(l.catalogCategory!)
        .then((c) => (c.designs.length === 0 ? l.key : null))
        .catch(() => null)
    )
  ).then((keys) => new Set(keys.filter((k): k is string => k !== null)));
  return emptyLinesPromise;
}
