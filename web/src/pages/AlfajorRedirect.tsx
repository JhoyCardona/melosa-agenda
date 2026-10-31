import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWithRetry } from '../api';
import type { ProductDesign, PublicCakeCatalog } from '../types';
import { CATALOG_LINES } from '../catalogLines';

// /alfajor → wherever alfajor cakes are booked today. Once the new alfajor
// catalog (catalog v2) has a bookable design, that catalog; until then the
// single pre-v2 alfajor cake's booking page, whose id comes from the database
// (it changes if the design is ever recreated). Menus and promos link here so
// they switch over by themselves. Falls back to the cake catalog.
export default function AlfajorRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    async function go() {
      const v2 = await getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog', {
        config: { params: { category: 'ALFAJOR_CAKE' } },
      });
      if (v2.designs.length > 0) return CATALOG_LINES.ALFAJOR_CAKE.catalogHref;
      const legacy = (await getWithRetry<ProductDesign[]>('/product-designs')).find(
        (d) => d.category === 'ALFAJOR_CAKE'
      );
      return legacy ? `/agendar/${legacy.id}` : '/catalogo';
    }
    go()
      .then((href) => navigate(href, { replace: true }))
      .catch((err) => {
        console.error('Error cargando torta de alfajor:', err);
        navigate('/catalogo', { replace: true });
      });
  }, [navigate]);

  return <p style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</p>;
}
