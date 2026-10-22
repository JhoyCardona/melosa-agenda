// ALFAJOR isn't a pickable option next to Vainilla/Chocolate — it's the fixed
// flavor the ALFAJOR_CAKE design always locks to (no flavor picker shown).
export type Flavor = 'VAINILLA' | 'CHOCOLATE' | 'ALFAJOR';

export interface ProductVariant {
  id: string;
  label: string;
  price: string;
  points: number;
  // Minutes this variant occupies on the delivery-day timeline.
  prepMinutes: number;
  // Portion count (5/10/15/20...), null when not sold by portions. Drives the
  // premium-relleno surcharge — set explicitly per variant, never parsed from
  // `label`.
  portions: number | null;
  enPromocion: boolean;
  // How many print images this size can carry. 1 for the ordinary case (a
  // single upload); a design like the memory cake sets this higher per size.
  maxCustomImages: number;
  // Client-facing choice that changes price + photo but isn't a color (gatitos
  // minicake: "1 gato" / "3 gatos"). Null for an ordinary variant.
  optionLabel: string | null;
  // Photo shown while this variant is selected; null falls back to the design's.
  imageUrl: string | null;
}

// One photo of a design in a given color. `colorName` is freeform text set by
// however the catalog was loaded (folder/file naming, not a master list).
export interface ProductDesignImage {
  id: string;
  colorName: string;
  imageUrl: string;
}

export interface ProductDesign {
  id: string;
  name: string;
  category: string;
  shape: string | null;
  imageUrl: string | null;
  allowsCustomImage: boolean;
  // True when the client MUST upload a print-ready image for this design
  // (Melosa doesn't edit/design the print herself). Meaningless unless
  // allowsCustomImage is also true.
  requiresCustomImage: boolean;
  allowsCustomText: boolean;
  // Per-design cap on the custom phrase/number length (20 by default; some
  // designs — smaller print area — cap it lower).
  customTextMaxLength: number;
  // Heading for the option picker ("Cantidad de gatos"); null = no picker.
  optionTitle: string | null;
  variants: ProductVariant[];
  images: ProductDesignImage[];
}

// Shape is a client pick on BookingPage (color-picker rework), not a fixed
// ProductDesign field. "Redonda" is the default.
export type CakeShape = 'Redonda' | 'Corazón';
export const CAKE_SHAPES: CakeShape[] = ['Redonda', 'Corazón'];

// Response of GET /public-orders/availability?date=&minutes=
export interface DeliveryPreview {
  isBusinessDay: boolean;
  isBlocked?: boolean;
  deliveryStartMinutes?: number;
  deliveryDurationMin?: number;
  deliveryEndMinutes?: number;
  deliveryTimeLabel?: string;
  closesAtLabel?: string;
  fits?: boolean;
}

export type ItemCategory = 'CAKE' | 'ALFAJOR_CAKE' | 'ALFAJOR_UNIT' | 'CUPCAKE' | 'DESSERT';

// One configured product line in the in-progress order. Carries a snapshot so
// the cart can render without re-fetching the catalog. Two shapes:
//  - LegacyCartItem: the variant-based catalog (today only the alfajor
//    minicake). No `kind` — carts saved before catalog v2 have none.
//  - CakeCartItem: a catalog v2 cake (color + size + flavors + shape ids).
export interface LegacyCartItem {
  kind?: 'legacy';
  key: string;
  designId: string;
  designName: string;
  designImageUrl: string | null;
  variantId: string;
  variantLabel: string;
  price: number;
  points: number;
  prepMinutes: number;
  flavor: Flavor;
  relleno: string;
  shape: CakeShape;
  color?: string;
  customText?: string;
  customImageUrl?: string;
  // Extra print images beyond the single-image case above, for a design whose
  // variant allows more than one (memory cake and similar).
  customImageUrls?: string[];
  // Client's WhatsApp reference photo ("quiero algo así"). Separate from
  // customImageUrl, which is edible-print artwork.
  referenceImageUrl?: string;
  // Set only when the line has print image(s); its surcharge is inside `price`.
  printImageType?: PrintImageType;
  // Client ticked "No quiero imágenes" on a design whose image is optional.
  withoutImages?: boolean;
}

export interface CakeCartItem {
  kind: 'cake';
  key: string;
  designId: string;
  designName: string;
  designImageUrl: string | null;
  colorId: string;
  color: string;
  sizeId: string;
  sizeLabel: string;
  portions: number;
  bizcochoId: string;
  bizcochoName: string;
  rellenoId: string;
  rellenoName: string;
  shapeId: string;
  shapeName: string;
  // Snapshot of the price/minutes shown when added; the server re-prices.
  price: number;
  prepMinutes: number;
  customText?: string;
  customImageUrls?: string[];
  // Set only when customImageUrls has at least one image; its surcharge is
  // already inside `price`.
  printImageType?: PrintImageType;
  // Client ticked "No quiero imágenes" on a design whose image is optional.
  withoutImages?: boolean;
}

export type CartItem = LegacyCartItem | CakeCartItem;

export function isCakeItem(item: CartItem): item is CakeCartItem {
  return item.kind === 'cake';
}

// ─── Catalog v2: public cake catalog (GET /public-orders/cake-catalog) ───

export type PrintImageType = 'NON_EDIBLE' | 'EDIBLE';

export interface PublicCakeSize {
  sizeId: string;
  label: string;
  portions: number;
  prepMinutes: number;
  price: number;
}

export interface PublicCakeColor {
  id: string;
  colorName: string;
  imageUrl: string;
  sizes: PublicCakeSize[];
  bizcochoIds: string[];
  rellenoIds: string[];
  shapes: { id: string; name: string }[];
}

export interface PublicCakeDesign {
  id: string;
  name: string;
  allowsCustomImage: boolean;
  requiresCustomImage: boolean;
  allowsCustomText: boolean;
  customTextMaxLength: number;
  imageLimits: Record<string, number>;
  colors: PublicCakeColor[];
}

export interface PublicCakeFlavor {
  id: string;
  name: string;
  kind: FlavorKind;
  surcharges: Record<string, number>;
}

export interface PublicCakeCatalog {
  designs: PublicCakeDesign[];
  flavors: PublicCakeFlavor[];
  // Per-cake surcharge for adding print image(s), by print type.
  printImagePrices: Record<PrintImageType, number>;
}

// ─── Catalog v2: global cake settings (GET /cake-settings, admin only) ───
// `usedByColors` = how many design colors reference the row, so the UI can
// warn before a delete wipes it from all of them. Named *Setting to stay clear
// of the legacy CakeShape string union above (still used by the booking page).

export interface CakeSizeSetting {
  id: string;
  label: string;
  portions: number;
  prepMinutes: number;
  requiresFullPayment: boolean;
  active: boolean;
  usedByColors: number;
}

export type FlavorKind = 'BIZCOCHO' | 'RELLENO';

export interface CakeFlavorSetting {
  id: string;
  name: string;
  kind: FlavorKind;
  active: boolean;
  usedByColors: number;
  // { sizeId: surcharge in pesos } — a size missing from the map costs 0 extra.
  surcharges: Record<string, number>;
}

export interface CakeShapeSetting {
  id: string;
  name: string;
  active: boolean;
  usedByColors: number;
}

export interface CakeSettings {
  sizes: CakeSizeSetting[];
  bizcochos: CakeFlavorSetting[];
  rellenos: CakeFlavorSetting[];
  shapes: CakeShapeSetting[];
}

// ─── Catalog v2: designs (GET /cake-designs, admin only) ───

export interface DesignColorConfig {
  id: string;
  colorName: string;
  imageUrl: string;
  flavorIds: string[];
  shapeIds: string[];
  // { sizeId: price } — a size missing from the map isn't offered in this color.
  sizePrices: Record<string, number>;
}

export interface CakeDesignV2 {
  id: string;
  name: string;
  imageUrl: string | null;
  allowsCustomImage: boolean;
  requiresCustomImage: boolean;
  allowsCustomText: boolean;
  customTextMaxLength: number;
  // { sizeId: max print images } — a size missing from the map allows 1.
  imageLimits: Record<string, number>;
  colors: DesignColorConfig[];
}
