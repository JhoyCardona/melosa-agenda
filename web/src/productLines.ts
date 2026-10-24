// Every product line Melosa sells, in display order. Shared by the header's
// "Productos" menu and the home "Nuestros productos" grid. A line without an
// href isn't bookable yet (no photos or business rules decided) and shows as
// "Próximamente".

// Stable link to the alfajor cake: its design id lives in the database, so
// this route looks it up and redirects (see AlfajorRedirect).
export const ALFAJOR_HREF = '/alfajor';

export interface ProductLine {
  key: string;
  name: string;
  href?: string;
}

export const PRODUCT_LINES: ProductLine[] = [
  { key: 'cakes', name: 'Cakes', href: '/catalogo' },
  { key: 'alfajor', name: 'Cakes de alfajor', href: ALFAJOR_HREF },
  { key: 'combos', name: 'Combos' },
  { key: 'cupcakes', name: 'Cupcakes' },
  { key: 'alfajores', name: 'Alfajores' },
  { key: 'postres', name: 'Postres' },
];
