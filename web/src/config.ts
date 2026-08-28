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
