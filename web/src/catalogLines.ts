// Product lines that run on the catalog v2 machinery (designs + colors + their
// own sizes/flavors/shapes). The admin "Diseños" and "Sabores, tamaños y
// formas" screens are shared; this tells them which line they're editing.
//
// Small alfajores (ALFAJOR_UNIT) reuse the same machinery with other words: a
// design is a FLAVOR ("Alfajor de chocolate") with one photo, its shapes and
// the price of ONE alfajor per size (mini/personal/grande). The boxes
// (quantities + decorations, with their prices) are global, on their own
// screen (boxesHref).
//
// Cupcakes (CUPCAKE) are like cakes (designs + colors), but a size is a box
// (x3, x6, x12: `portions` = cupcakes in it), there's no shape, and a flavor's
// surcharge is one price per cupcake that the box multiplies.

import type { CatalogCategory } from './types';

export type CatalogLine = CatalogCategory;

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
  // Appended to the admin screen titles ("" for cakes).
  adminSuffix: string;
  // true for small alfajores: designs are flavors with a single photo, no
  // bizcocho/relleno, and the boxes live on their own screen.
  boxes: boolean;
  // Small alfajores only: the "Cajas y cantidades" screen.
  boxesHref?: string;
  // false for cupcakes: no shape to set up or to pick.
  shapes: boolean;
  // Cupcakes: what a size counts ("cupcakes") — sizes are boxes of N, and
  // flavor surcharges are per unit. null for every other line.
  unitName: string | null;
}

export const CATALOG_LINES: Record<CatalogLine, CatalogLineInfo> = {
  CAKE: {
    category: 'CAKE',
    adminHref: '/admin/tortas',
    designsHref: '/admin/tortas/disenos',
    settingsHref: '/admin/tortas/sabores-tamanos',
    plural: 'tortas',
    catalogHref: '/catalogo',
    adminSuffix: '',
    boxes: false,
    shapes: true,
    unitName: null,
  },
  ALFAJOR_CAKE: {
    category: 'ALFAJOR_CAKE',
    adminHref: '/admin/alfajores/torta',
    designsHref: '/admin/alfajores/torta/disenos',
    settingsHref: '/admin/alfajores/torta/sabores-tamanos',
    plural: 'tortas de alfajor',
    catalogHref: '/catalogo-alfajor',
    adminSuffix: ' · torta de alfajor',
    boxes: false,
    shapes: true,
    unitName: null,
  },
  ALFAJOR_UNIT: {
    category: 'ALFAJOR_UNIT',
    adminHref: '/admin/alfajores/sueltos',
    designsHref: '/admin/alfajores/sueltos/sabores',
    settingsHref: '/admin/alfajores/sueltos/tamanos-formas',
    boxesHref: '/admin/alfajores/sueltos/cajas',
    plural: 'alfajores',
    catalogHref: '/catalogo-alfajores',
    adminSuffix: ' · alfajores',
    boxes: true,
    shapes: true,
    unitName: null,
  },
  CUPCAKE: {
    category: 'CUPCAKE',
    adminHref: '/admin/cupcakes',
    designsHref: '/admin/cupcakes/disenos',
    settingsHref: '/admin/cupcakes/sabores-tamanos',
    plural: 'cupcakes',
    catalogHref: '/catalogo-cupcakes',
    adminSuffix: ' · cupcakes',
    boxes: false,
    shapes: false,
    unitName: 'cupcakes',
  },
};

// Words that change between cakes and small alfajores, for the shared screens.
export function lineWords(line: CatalogLineInfo) {
  return line.boxes
    ? {
        design: 'sabor',
        designs: 'sabores',
        color: 'foto',
        colors: 'fotos',
        bizcocho: 'sabor del alfajor',
        bizcochos: 'Sabores del alfajor',
        relleno: 'relleno',
        rellenos: 'Rellenos',
      }
    : {
        design: 'diseño',
        designs: 'diseños',
        color: 'color',
        colors: 'colores',
        bizcocho: 'sabor de bizcocho',
        bizcochos: 'Sabores de bizcocho',
        relleno: 'sabor de relleno',
        rellenos: 'Sabores de relleno',
      };
}
