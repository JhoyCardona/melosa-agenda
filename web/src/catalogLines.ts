// Product lines that run on the catalog v2 machinery (designs + colors + their
// own sizes/flavors/shapes). The admin "Diseños" and "Sabores, tamaños y
// formas" screens are shared; this tells them which line they're editing.
//
// Small alfajores (ALFAJOR_UNIT) reuse the same machinery with other words: a
// design is a box ("Caja x15"), each of its colors is a packaging (empaque)
// with its own photo and prices, sizes are mini/personal/grande.

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
  // true for small alfajores: designs are boxes, colors are packagings.
  boxes: boolean;
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
  },
  ALFAJOR_UNIT: {
    category: 'ALFAJOR_UNIT',
    adminHref: '/admin/alfajores/sueltos',
    designsHref: '/admin/alfajores/sueltos/cajas',
    settingsHref: '/admin/alfajores/sueltos/tamanos-sabores',
    plural: 'alfajores',
    catalogHref: '/catalogo-alfajores',
    adminSuffix: ' · alfajores',
    boxes: true,
  },
};

// Words that change between cakes and alfajor boxes, for the shared screens.
export function lineWords(line: CatalogLineInfo) {
  return line.boxes
    ? {
        design: 'caja',
        designs: 'cajas',
        color: 'empaque',
        colors: 'empaques',
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
