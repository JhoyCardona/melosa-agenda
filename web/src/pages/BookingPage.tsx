import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import type { DeliveryPreview, Flavor, ProductDesign } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import { waLink } from '../config';
import './BookingPage.css';

const flavorLabels: Record<Flavor, string> = { VAINILLA: 'Vainilla', CHOCOLATE: 'Chocolate' };
const FLAVORS: Flavor[] = ['VAINILLA', 'CHOCOLATE'];

// Mirrors the backend cap (createPublicOrder). Bigger orders go through WhatsApp.
const MAX_ITEMS = 12;
const MAX_CUSTOM_TEXT = 200;
// Last confirmation, kept only to survive an accidental page reload (consumed once).
const CONFIRM_KEY = 'melosa_last_confirmation';

// Earliest bookable delivery date = today (Colombia, UTC-5) + 2 calendar days,
// i.e. the 48h booking cutoff. The public order endpoint re-checks this.
function earliestDeliveryDateString(): string {
  const colombiaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  colombiaNow.setUTCDate(colombiaNow.getUTCDate() + 2);
  return colombiaNow.toISOString().slice(0, 10);
}

// "Minicake Blanca y Rosada (2 porciones) x2, Torta 5 porciones x1" — the compact
// breakdown that goes into the WhatsApp confirmation message.
function itemsBreakdown(items: { designName: string; variantLabel: string }[]): string {
  const counts = new Map<string, number>();
  for (const i of items) {
    const key = `${i.designName} (${i.variantLabel})`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, n]) => `${label} x${n}`)
    .join(', ');
}

// "2026-09-01" -> "martes 1 de septiembre". Noon avoids any timezone day-shift.
function formatDeliveryDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface OrderResult {
  id: string;
  ticketNumber: number;
  totalPrice: string;
  requiredPaymentPercent: number;
  deliveryTimeLabel?: string;
}

export default function BookingPage() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const draft = useOrderDraft();

  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [designsLoaded, setDesignsLoaded] = useState(false);

  // Per-item configurator (the product currently being built, not yet added).
  const [variantId, setVariantId] = useState('');
  const [flavor, setFlavor] = useState<Flavor>('VAINILLA');
  const [customText, setCustomText] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<OrderResult | null>(null);
  const [confirmedName, setConfirmedName] = useState('');
  const [confirmedBreakdown, setConfirmedBreakdown] = useState('');

  const design = designs.find((d) => d.id === designId);
  const variant = design?.variants.find((v) => v.id === variantId);

  useEffect(() => {
    api
      .get<ProductDesign[]>('/product-designs')
      .then((res) => setDesigns(res.data))
      .catch((err) => console.error('Error cargando catálogo:', err))
      .finally(() => setDesignsLoaded(true));
  }, []);

  // Bad or missing design id → back to the catalog to pick one.
  useEffect(() => {
    if (designsLoaded && !design) navigate('/catalogo', { replace: true });
  }, [designsLoaded, design, navigate]);

  // On mount: always consume any stored confirmation, but only re-show it when
  // this was an actual page reload — so an accidental F5 on "¡Pedido recibido!"
  // doesn't wipe the ticket number, while navigating back to book again doesn't
  // resurrect the old confirmation.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONFIRM_KEY);
      if (!raw) return;
      sessionStorage.removeItem(CONFIRM_KEY);
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (nav?.type !== 'reload') return;
      const saved = JSON.parse(raw) as { result: OrderResult; name: string; breakdown: string };
      setResult(saved.result);
      setConfirmedName(saved.name);
      setConfirmedBreakdown(saved.breakdown);
    } catch {
      // ignore
    }
  }, []);

  // Reset the configurator whenever the design changes.
  useEffect(() => {
    setVariantId(design && design.variants.length > 0 ? design.variants[0].id : '');
    setFlavor('VAINILLA');
    setCustomText('');
    setCustomImageUrl('');
    setImageError('');
  }, [design]);

  useEffect(() => {
    if (!draft.deliveryDate) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setPreviewError(false);
    api
      .get<DeliveryPreview>('/public-orders/availability', {
        params: { date: draft.deliveryDate, minutes: draft.totalMinutes },
      })
      .then((res) => setPreview(res.data))
      .catch((err) => {
        console.error('Error cargando disponibilidad:', err);
        setPreview(null);
        setPreviewError(true);
      })
      .finally(() => setLoadingPreview(false));
  }, [draft.deliveryDate, draft.totalMinutes]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !design) return;
    setImageError('');
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('productDesignId', design.id);
      const response = await api.post<{ imageUrl: string }>('/public-orders/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCustomImageUrl(response.data.imageUrl);
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo subir la imagen. Prueba con otra foto.';
      setImageError(message);
    } finally {
      setUploadingImage(false);
    }
  }

  const cartFull = draft.items.length >= MAX_ITEMS;

  function handleAddItem() {
    if (!design || !variant || cartFull) return;
    draft.addItem({
      key: newKey(),
      designId: design.id,
      designName: design.name,
      designImageUrl: design.imageUrl,
      variantId: variant.id,
      variantLabel: variant.label,
      price: Number(variant.price),
      points: variant.points,
      prepMinutes: variant.prepMinutes,
      flavor,
      customText: customText.trim() || undefined,
      customImageUrl: customImageUrl || undefined,
    });
    setCustomText('');
    setCustomImageUrl('');
    setImageError('');
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2500);
  }

  const canSubmit =
    draft.items.length > 0 &&
    !!draft.deliveryDate &&
    !!preview?.isBusinessDay &&
    !!preview?.fits &&
    !!draft.clientName.trim() &&
    !!draft.clientPhone.trim() &&
    !submitting;

  async function handleSubmit() {
    setErrorMessage('');
    setSubmitting(true);
    try {
      const response = await api.post<OrderResult>('/public-orders', {
        clientName: draft.clientName.trim(),
        // Keep only digits and a leading +, but accept any country's number.
        clientPhone: draft.clientPhone.replace(/[^\d+]/g, ''),
        deliveryDate: draft.deliveryDate,
        notes: draft.notes.trim() || undefined,
        items: draft.items.map((i) => ({
          productDesignId: i.designId,
          variantId: i.variantId,
          flavor: i.flavor,
          customText: i.customText,
          customImageUrl: i.customImageUrl,
        })),
      });
      const name = draft.clientName.trim();
      const breakdown = itemsBreakdown(draft.items);
      setConfirmedName(name);
      setConfirmedBreakdown(breakdown);
      setResult(response.data);
      draft.reset();
      try {
        sessionStorage.setItem(
          CONFIRM_KEY,
          JSON.stringify({ result: response.data, name, breakdown })
        );
      } catch {
        // storage disabled — the confirmation still shows, just won't survive a reload
      }
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo enviar el pedido. Intenta de nuevo.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const waHref = waLink(
      `Hola, soy ${confirmedName}. Agendé el pedido #${result.ticketNumber}.\n` +
        `${confirmedBreakdown}\n` +
        `Total: $${Number(result.totalPrice).toLocaleString('es-CO')}. Te comparto el comprobante del abono.`
    );
    return (
      <div className="booking-page">
        <AnnouncementBar />
        <SiteHeader />
        <main className="booking-main">
          <div className="confirmation-card">
            <h1>¡Pedido recibido!</h1>
            <p>
              Tu ticket es <strong>#{result.ticketNumber}</strong>.
            </p>
            <p>
              Total: <strong>${Number(result.totalPrice).toLocaleString('es-CO')}</strong>
            </p>
            {result.deliveryTimeLabel && (
              <p>
                Tu pedido va a estar listo a partir de las{' '}
                <strong>{result.deliveryTimeLabel}</strong>. Puedes recogerlo a esa hora o más tarde
                ese mismo día.
              </p>
            )}
            <p>
              Requiere un abono del <strong>{result.requiredPaymentPercent}%</strong>. Manda el
              comprobante por WhatsApp para confirmar tu pedido.
            </p>
            <p className="booking-ticket-note">
              Guarda tu número de ticket <strong>#{result.ticketNumber}</strong>. Si nos escribes por
              cualquier tema de tu pedido, dánoslo siempre: es la forma en que ubicamos tu pedido.
            </p>
            <a className="whatsapp-button" href={waHref} target="_blank" rel="noreferrer">
              Confirmar por WhatsApp
            </a>
            <Link to="/" className="booking-back">
              Volver al inicio
            </Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!designsLoaded || !design) {
    return (
      <div className="booking-page">
        <AnnouncementBar />
        <SiteHeader />
        <main className="booking-main">
          <p className="muted">Cargando...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <AnnouncementBar />
      <SiteHeader />

      <main className="booking-main">
        <Link to="/catalogo" className="booking-back">
          ← Volver al catálogo
        </Link>
        <h1>Arma tu pedido</h1>

        {/* ---------- Configurador del producto actual ---------- */}
        <section className="booking-block">
          <div className="config-head">
            {design.imageUrl ? (
              <img className="config-photo" src={design.imageUrl} alt={design.name} />
            ) : (
              <div className="config-photo config-photo-empty" aria-hidden="true">
                Sin foto
              </div>
            )}
            <div>
              <p className="eyebrow">Estás personalizando</p>
              <h2>{design.name}</h2>
            </div>
          </div>

          <label className="field-label">Tamaño</label>
          <div className="pills">
            {design.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`pill ${variantId === v.id ? 'pill-active' : ''}`}
                onClick={() => setVariantId(v.id)}
              >
                {v.label} — ${Number(v.price).toLocaleString('es-CO')}
              </button>
            ))}
          </div>

          <label className="field-label">Sabor de la torta</label>
          <div className="pills">
            {FLAVORS.map((f) => (
              <button
                key={f}
                type="button"
                className={`pill ${flavor === f ? 'pill-active' : ''}`}
                onClick={() => setFlavor(f)}
              >
                {flavorLabels[f]}
              </button>
            ))}
          </div>

          {design.allowsCustomText && (
            <>
              <label className="field-label">Texto personalizado (opcional)</label>
              <input
                type="text"
                maxLength={MAX_CUSTOM_TEXT}
                placeholder="Una frase o un número. Ej: Feliz cumple Ana — 30"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />
            </>
          )}

          {design.allowsCustomImage && (
            <>
              <label className="field-label">Imagen para imprimir (opcional)</label>
              <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploadingImage} />
              {uploadingImage && <p className="muted">Subiendo imagen...</p>}
              {imageError && <p className="warning">{imageError}</p>}
              {customImageUrl && (
                <img className="config-photo" src={customImageUrl} alt="Imagen personalizada" />
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddItem}
            disabled={!variant || uploadingImage || cartFull}
          >
            Agregar al pedido
          </button>
          {cartFull && (
            <p className="warning">
              Un pedido web admite hasta {MAX_ITEMS} productos. Para más, escríbenos por WhatsApp.
            </p>
          )}
          {justAdded && !cartFull && <p className="added-flash">Agregado a tu pedido ✓</p>}
        </section>

        {/* ---------- Carrito ---------- */}
        {draft.items.length > 0 && (
          <section className="booking-block">
            <h2>Tu pedido ({draft.items.length})</h2>
            <ul className="cart-list">
              {draft.items.map((i) => (
                <li key={i.key}>
                  <span>
                    {i.designName} · {i.variantLabel} · {flavorLabels[i.flavor]}
                    {i.customText ? ` · "${i.customText}"` : ''}
                    {i.customImageUrl ? ' · con imagen' : ''}
                  </span>
                  <span className="cart-item-right">
                    ${i.price.toLocaleString('es-CO')}
                    <button type="button" aria-label="Quitar del pedido" onClick={() => draft.removeItem(i.key)}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/catalogo" className="btn btn-ghost">
              Agregar otro producto
            </Link>
          </section>
        )}

        {/* ---------- Entrega ---------- */}
        <section className="booking-block">
          <h2>Fecha de entrega</h2>
          <input
            type="date"
            min={earliestDeliveryDateString()}
            value={draft.deliveryDate}
            onChange={(e) => draft.patch({ deliveryDate: e.target.value })}
          />
          <p className="field-hint">Necesitamos al menos 48 horas de anticipación.</p>

          {/* Live pickup-time estimate: recalculates whenever the date or the
              cart changes, so the client sees the hour before adding anything. */}
          <div className="slot-box">
            {!draft.deliveryDate && (
              <p className="slot-hint">Elige una fecha para ver a qué hora estaría listo tu pedido.</p>
            )}

            {draft.deliveryDate && loadingPreview && (
              <p className="slot-hint">Calculando la hora...</p>
            )}

            {draft.deliveryDate && !loadingPreview && previewError && (
              <p className="warning">
                No pudimos calcular la hora ahora mismo. Revisa tu conexión y vuelve a intentar en un
                momento.
              </p>
            )}

            {draft.deliveryDate && !loadingPreview && preview && (
              <>
                {!preview.isBusinessDay && (
                  <p className="warning">
                    Ese día no agendamos (domingo o festivo). Elige otra fecha.
                  </p>
                )}

                {/* No hay productos aún: mostramos desde qué hora entrega ese día. */}
                {preview.isBusinessDay && draft.totalMinutes === 0 && (
                  <>
                    <p className="slot-label">Ese día entregamos</p>
                    <p className="slot-time">desde las {preview.deliveryTimeLabel}</p>
                    <p className="slot-sub">
                      Agrega productos y te calculamos la hora exacta de recogida de tu pedido.
                    </p>
                  </>
                )}

                {preview.isBusinessDay && draft.totalMinutes > 0 && preview.fits && (
                  <>
                    <p className="slot-label">Tu pedido estaría listo</p>
                    <p className="slot-time">a partir de las {preview.deliveryTimeLabel}</p>
                    <p className="slot-sub">
                      Puedes recogerlo a esa hora o más tarde ese mismo día, hasta las{' '}
                      {preview.closesAtLabel}. Si lo necesitas antes, elige otro día.
                    </p>
                  </>
                )}

                {preview.isBusinessDay && draft.totalMinutes > 0 && !preview.fits && (
                  <p className="warning">
                    Ese día ya está lleno (entregamos hasta las {preview.closesAtLabel}). Elige otra
                    fecha.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* ---------- Datos ---------- */}
        <section className="booking-block">
          <h2>Tus datos</h2>
          <label className="field-label">Nombre completo</label>
          <input
            type="text"
            value={draft.clientName}
            onChange={(e) => draft.patch({ clientName: e.target.value })}
          />

          <label className="field-label">Teléfono (WhatsApp)</label>
          <input
            type="tel"
            value={draft.clientPhone}
            onChange={(e) => draft.patch({ clientPhone: e.target.value })}
          />

          <label className="field-label">Notas (opcional)</label>
          <textarea value={draft.notes} onChange={(e) => draft.patch({ notes: e.target.value })} />

          <p className="muted">Todos los pedidos son para recoger en el local.</p>
        </section>

        {/* ---------- Resumen antes de pagar ---------- */}
        {draft.items.length > 0 &&
          draft.deliveryDate &&
          preview?.isBusinessDay &&
          preview?.fits && (
            <section className="booking-block booking-recap">
              <h2>Antes de enviar</h2>
              <dl className="recap-list">
                <div>
                  <dt>Productos</dt>
                  <dd>{draft.items.length}</dd>
                </div>
                <div>
                  <dt>Entrega</dt>
                  <dd>{formatDeliveryDate(draft.deliveryDate)}</dd>
                </div>
                <div>
                  <dt>Hora de recogida</dt>
                  <dd>a partir de las {preview.deliveryTimeLabel}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>${draft.totalPrice.toLocaleString('es-CO')}</dd>
                </div>
              </dl>
            </section>
          )}

        <div className="checkout-bar">
          <div className="checkout-bar-inner">
            <div className="checkout-total">
              <span className="checkout-total-label">Total</span>
              <span className="checkout-total-amount">
                ${draft.totalPrice.toLocaleString('es-CO')}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary checkout-send"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitting ? 'Enviando...' : 'Enviar por WhatsApp'}
            </button>
          </div>
          {errorMessage && <p className="warning checkout-error">{errorMessage}</p>}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
