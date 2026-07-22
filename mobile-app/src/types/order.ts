export type ItemCategory = 'CAKE' | 'ALFAJOR_CAKE' | 'ALFAJOR_UNIT' | 'CUPCAKE' | 'DESSERT';

export interface CakeDetails {
  servings: string;
  flavor: string;
  filling: string;
  color: string;
  decorations: string;
  cakeText: string;
}

export interface DraftOrderItem {
  category: ItemCategory;
  price: string;
  imageUrl: string | null;
  details: CakeDetails;
}

export interface ClientData {
  clientName: string;
  clientPhone: string;
  deliveryDate: string;
  deliveryAddress: string;
}