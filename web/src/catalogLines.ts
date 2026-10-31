// Product lines that run on the catalog v2 machinery (designs + colors + their
// own sizes/flavors/shapes). The admin "Diseños" and "Sabores, tamaños y
// formas" screens are shared; this tells them which line they're editing.

export type CatalogLine = 'CAKE' | 'ALFAJOR_CAKE';

export interface CatalogLineInfo {
  category: CatalogLine;
  // Admin hub the screens go back to.
  adminHref: string;
  designsHref: string;
  settingsHref: string;
  // Plural name used in hints ("aplica para todas las tortas").
  plural: string;
  // Public catalog of this line.
  catalogHref: string;
}

export const CATALOG_LINES: Record<CatalogLine, CatalogLineInfo> = {
  CAKE: {
    category: 'CAKE',
    adminHref: '/admin/tortas',
    designsHref: '/admin/tortas/disenos',
    settingsHref: '/admin/tortas/sabores-tamanos',
    plural: 'tortas',
    catalogHref: '/catalogo',
  },
  ALFAJOR_CAKE: {
    category: 'ALFAJOR_CAKE',
    adminHref: '/admin/alfajores/torta',
    designsHref: '/admin/alfajores/torta/disenos',
    settingsHref: '/admin/alfajores/torta/sabores-tamanos',
    plural: 'tortas de alfajor',
    catalogHref: '/catalogo-alfajor',
  },
};
