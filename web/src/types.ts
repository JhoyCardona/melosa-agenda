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

// One configured product line in the in-progress order. Carries a snapshot of the
// design/variant so the cart can render without re-fetching the catalog.
export interface CartItem {
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
}
