import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWithRetry } from '../api';
import type { ProductDesign } from '../types';

// /alfajor → the alfajor cake's booking page. Its id comes from the catalog
// (it changes if the design is ever recreated), so menus can link here
// without fetching it themselves. Falls back to the catalog.
export default function AlfajorRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    getWithRetry<ProductDesign[]>('/product-designs')
      .then((data) => {
        const alfajor = data.find((d) => d.category === 'ALFAJOR_CAKE');
        navigate(alfajor ? `/agendar/${alfajor.id}` : '/catalogo', { replace: true });
      })
      .catch((err) => {
        console.error('Error cargando diseño de alfajor:', err);
        navigate('/catalogo', { replace: true });
      });
  }, [navigate]);

  return <p style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</p>;
}
