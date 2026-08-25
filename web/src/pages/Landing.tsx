import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { ProductDesign } from '../types';
import './Landing.css';

export default function Landing() {
  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ProductDesign[]>('/product-designs')
      .then((res) => setDesigns(res.data))
      .catch((err) => console.error('Error cargando catálogo:', err))
      .finally(() => setLoading(false));
  }, []);

  const promoDesigns = designs.filter((d) => d.variants.some((v) => v.enPromocion));

  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>Melosa</h1>
        <p className="tagline">Tortas y minicakes hechos a pedido</p>
        <Link to="/agendar" className="cta-button">
          Agendar mi pedido
        </Link>
      </header>

      <section className="promo-section">
        <h2>En promoción</h2>
        <p className="promo-note">Minicakes individuales de 2 porciones, ideales para regalar.</p>

        {loading ? (
          <p className="muted">Cargando catálogo...</p>
        ) : promoDesigns.length === 0 ? (
          <p className="muted">Pronto vamos a tener novedades acá.</p>
        ) : (
          <div className="promo-grid">
            {promoDesigns.map((design) => {
              const promoVariant = design.variants.find((v) => v.enPromocion)!;
              return (
                <div key={design.id} className="promo-card">
                  {design.imageUrl && <img src={design.imageUrl} alt={design.name} />}
                  <div className="promo-card-body">
                    <h3>{design.name}</h3>
                    <p className="price">${Number(promoVariant.price).toLocaleString('es-CO')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="how-it-works">
        <h2>¿Cómo funciona?</h2>
        <ol>
          <li>Elegís tu torta o minicake y la fecha de entrega.</li>
          <li>Confirmamos tu pedido y te mandamos el resumen por WhatsApp.</li>
          <li>Nos pagás el abono y listo, tu pedido queda agendado.</li>
        </ol>
        <Link to="/agendar" className="cta-button secondary">
          Empezar a agendar
        </Link>
      </section>
    </div>
  );
}
