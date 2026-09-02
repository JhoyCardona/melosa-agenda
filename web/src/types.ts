export type Flavor = 'VAINILLA' | 'CHOCOLATE';

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
}

export interface ProductDesign {
  id: string;
  name: string;
  category: string;
  shape: string | null;
  imageUrl: string | null;
  allowsCustomImage: boolean;
  allowsCustomText: boolean;
  variants: ProductVariant[];
}

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
  customText?: string;
  customImageUrl?: string;
  // Client's WhatsApp reference photo ("quiero algo así"). Separate from
  // customImageUrl, which is edible-print artwork.
  referenceImageUrl?: string;
}
