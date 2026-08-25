export type Flavor = 'VAINILLA' | 'CHOCOLATE';

export type TimeBlock = 'SLOT_14_15' | 'SLOT_15_16' | 'SLOT_16_17' | 'SLOT_17_18' | 'SLOT_18_19';

export interface ProductVariant {
  id: string;
  label: string;
  price: string;
  points: number;
  enPromocion: boolean;
}

export interface ProductDesign {
  id: string;
  name: string;
  category: string;
  shape: string | null;
  imageUrl: string | null;
  variants: ProductVariant[];
}

export interface BlockAvailability {
  block: TimeBlock;
  label: string;
  pointsUsed: number;
  pointsAvailable: number;
}

export interface DraftItem {
  key: string;
  productDesignId: string;
  productDesignName: string;
  variantId: string;
  variantLabel: string;
  price: number;
  points: number;
  flavor: Flavor;
  customText?: string;
}
