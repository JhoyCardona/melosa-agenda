// Single source of truth for contact info, socials and business hours.
// The client said hours "may change soon" — keeping them here means one edit,
// no hunting through components.

export const WHATSAPP_NUMBER = '573172932484';

// Default greeting, matches the shortened tinyurl.com/melosa-bakery-oficial link.
export const WHATSAPP_DEFAULT_MESSAGE = 'Hola Melosa, quiero cotizar uno de tus productos 😊';

// Always build wa.me links from the raw number, never from the tinyurl: a
// shortener can't forward a dynamic ?text= message (the booking confirmation
// needs that), and it adds an extra redirect + a dependency that can break.
export function waLink(message: string = WHATSAPP_DEFAULT_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const SOCIAL = {
  instagram: 'https://instagram.com/melosapasteleria.med',
  tiktok: 'https://tiktok.com/@melosa.bakery',
  facebook: 'https://www.facebook.com/profile.php?id=61556591380759',
};

// Filling list and premium surcharge — kept in sync by hand with the backend's
// backend/src/services/pricing.ts (no shared package between the two yet).
// Only used for a torta sold by porciones — a minicake is always locked to
// Vainilla, no choice shown.
export const RELLENOS_BASICOS = ['Vainilla', 'Arequipe', 'Chocolate', 'Frutos rojos'];
export const RELLENOS_PREMIUM = ['Oreo', 'Milo', 'Fresas con crema'];
export const RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS: Record<number, number> = {
  5: 5000,
  10: 10000,
  15: 12500,
  20: 15000,
};

// `portions` comes straight from ProductVariant.portions (set explicitly in the
// admin catalog screen), never parsed from the label text — a mislabeled
// variant used to silently lose its surcharge.
export function rellenoSurcharge(
  relleno: string | null | undefined,
  portions: number | null,
  isPromo: boolean
): number {
  if (isPromo || !relleno) return 0;
  if (!RELLENOS_PREMIUM.includes(relleno)) return 0;
  if (portions === null) return 0;
  return RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS[portions] ?? 0;
}

// Payment options shown on the booking confirmation screen — the client pays
// manually (Nequi/Bancolombia/Llave) and sends the proof over WhatsApp; there's
// no payment gateway integrated yet.
export const PAYMENT = {
  bancolombiaAhorros: '91223671581',
  nequi: '3172932484',
  llave: '@carolina7118',
  accountHolder: 'Carolina Restrepo',
};
export const PAYMENT_WARNING =
  'Cuando realices el pago, envíanos el comprobante junto con el NOMBRE DE LA PERSONA QUE TRANSFIERE para confirmar tu reserva.';

export const BUSINESS = {
  addressLine: 'Calle 3 Sur #53-8, Rodeo Sur, Guayabal',
  city: 'Medellín',
  nearestMetro: 'Poblado',
  mapsUrl: 'https://maps.app.goo.gl/Yq5RiKQ5f9zepG6h8',

  // TODO(confirmar con gretica): días de atención. Asumido lunes a sábado.
  attentionChannel: 'Solo atendemos por WhatsApp',
  attentionHours: 'Lunes a sábado, 10:00 a.m. – 5:30 p.m.',

  deliveryHours: '2:00 p.m. – 7:00 p.m.',
  deliveryNote: 'Solo días hábiles. No entregamos domingos ni festivos.',

  pickupOnly: true,
};
