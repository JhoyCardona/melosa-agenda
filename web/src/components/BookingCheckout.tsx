import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { DeliveryPreview } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { waLink, BUSINESS } from '../config';
import {
  MAX_CLIENT_NAME,
  cartItemSummary,
  earliestDeliveryDateString,
  formatDeliveryDate,
  itemsBreakdown,
  toOrderLine,
} from '../bookingShared';

interface OrderResult {
  ticketNumber: number;
  totalPrice: string;
  deliveryTimeLabel?: string;
}

// Everything after the product configurator, shared by both booking pages
// (legacy/alfajor and catalog v2 cakes): cart, delivery date + live pickup
// time, customer data, recap, pickup address, and the "send by WhatsApp"
// submit. Works on the one shared cart, whatever mix of products it holds.
export default function BookingCheckout({ catalogHref }: { catalogHref: string }) {
  const draft = useOrderDraft();
  const earliestDate = earliestDeliveryDateString();

  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  // The date picker's `min` is only a soft hint (typable on desktop, and it goes
  // stale if the page sits open past midnight), so re-check the 48h floor here —
  // the backend rejects it anyway, this just stops a confusing "preview says OK,
  // submit says no".
  const dateTooSoon = !!draft.deliveryDate && draft.deliveryDate < earliestDate;

  const canSubmit =
    draft.items.length > 0 &&
    !!draft.deliveryDate &&
    !dateTooSoon &&
    !!preview?.isBusinessDay &&
    !preview?.isBlocked &&
    !!preview?.fits &&
    !!draft.clientName.trim() &&
    !!draft.clientPhone.trim() &&
    !submitting;

  // Set once the order exists. The booking form is swapped for a confirmation
  // with the ticket and a real WhatsApp link, so the client always has a way to
  // reach us even if the automatic jump to WhatsApp doesn't happen.
  const [sent, setSent] = useState<{ ticketNumber: number; waHref: string } | null>(null);
  const sentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sent) sentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [sent]);

  async function handleSubmit() {
    setErrorMessage('');
    setSubmitting(true);
    // No placeholder popup here: iOS Safari would switch to the blank tab
    // mid-request, and when it was closed on an error the booking tab came back
    // reloaded — the error message gone, the client stuck with "nothing happens".
    // Everything now stays in this one tab.
    try {
      const name = draft.clientName.trim();
      const normalizedPhone = draft.clientPhone.replace(/[^\d+]/g, '');
      const breakdown = itemsBreakdown(draft.items);

      const response = await api.post<OrderResult>('/public-orders', {
        clientName: name,
        // Keep only digits and a leading +, but accept any country's number.
        clientPhone: normalizedPhone,
        deliveryDate: draft.deliveryDate,
        items: draft.items.map(toOrderLine),
      });

      const waHref = waLink(
        `${name}\n` +
          `Tel: ${normalizedPhone}\n\n` +
          `Ticket #${response.data.ticketNumber}\n\n` +
          `${breakdown}\n\n` +
          `Día: ${formatDeliveryDate(draft.deliveryDate)}\n` +
          `Hora: ${response.data.deliveryTimeLabel ?? 'por confirmar'} (Esta es la hora mínima de entrega de mi pedido)\n\n` +
          `Total: $${Number(response.data.totalPrice).toLocaleString('es-CO')}\n\n` +
          `Este es el resumen de mi pedido, quiero proceder con el pago.`
      );
      draft.reset();
      setSent({ ticketNumber: response.data.ticketNumber, waHref });
      // Same-tab navigation after an await is never popup-blocked; on a phone
      // wa.me hands off to the WhatsApp app and this page stays behind it.
      window.location.href = waHref;
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo enviar el pedido. Revisa tu conexión e intenta de nuevo.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <section ref={sentRef} className="booking-block booking-sent">
        <h2>¡Tu pedido quedó agendado!</h2>
        <p>
          Tu número de ticket es <strong>#{sent.ticketNumber}</strong>. Envíanos el resumen por
          WhatsApp para continuar con el pago.
        </p>
        <a className="btn btn-primary" href={sent.waHref}>
          Abrir WhatsApp
        </a>
      </section>
    );
  }

  return (
    <>
      {/* ---------- Carrito ---------- */}
      {draft.items.length > 0 && (
        <section className="booking-block">
          <h2>Tu pedido ({draft.items.length})</h2>
          <ul className="cart-list">
            {draft.items.map((i) => (
              <li key={i.key}>
                <span>{cartItemSummary(i)}</span>
                <span className="cart-item-right">
                  ${i.price.toLocaleString('es-CO')}
                  <button type="button" aria-label="Quitar del pedido" onClick={() => draft.removeItem(i.key)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <Link to={catalogHref} className="btn btn-ghost">
            Agregar otro producto
          </Link>
        </section>
      )}

      {/* ---------- Entrega ---------- */}
      <section className="booking-block">
        <h2>Fecha de entrega</h2>
        <input
          type="date"
          min={earliestDate}
          value={draft.deliveryDate}
          onChange={(e) => draft.patch({ deliveryDate: e.target.value })}
        />
        <p className="field-hint">Necesitamos al menos 2 días de anticipación.</p>
        {dateTooSoon && (
          <p className="warning">
            Esa fecha es muy pronto. Elige una a partir del {formatDeliveryDate(earliestDate)}.
          </p>
        )}

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
                  Ese día no agendamos (domingo, lunes o festivo). Elige otra fecha.
                </p>
              )}

              {preview.isBusinessDay && preview.isBlocked && (
                <p className="warning">Ese día no está disponible. Elige otra fecha.</p>
              )}

              {/* No hay productos aún: mostramos desde qué hora entrega ese día. */}
              {preview.isBusinessDay && !preview.isBlocked && draft.totalMinutes === 0 && (
                <>
                  <p className="slot-label">Ese día entregamos</p>
                  <p className="slot-time">desde las {preview.deliveryTimeLabel}</p>
                  <p className="slot-sub">
                    Agrega productos y te calculamos la hora exacta de recogida de tu pedido.
                  </p>
                </>
              )}

              {preview.isBusinessDay && !preview.isBlocked && draft.totalMinutes > 0 && preview.fits && (
                <>
                  <p className="slot-label">Tu pedido estaría listo</p>
                  <p className="slot-time">a partir de las {preview.deliveryTimeLabel}</p>
                  <p className="slot-sub">
                    Puedes recogerlo a esa hora o más tarde ese mismo día, hasta las{' '}
                    {preview.closesAtLabel}. Si lo necesitas antes, elige otro día.
                  </p>
                </>
              )}

              {preview.isBusinessDay && !preview.isBlocked && draft.totalMinutes > 0 && !preview.fits && (
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
          maxLength={MAX_CLIENT_NAME}
          value={draft.clientName}
          onChange={(e) => draft.patch({ clientName: e.target.value })}
        />

        <label className="field-label">Teléfono (WhatsApp)</label>
        <input
          type="tel"
          value={draft.clientPhone}
          onChange={(e) => draft.patch({ clientPhone: e.target.value })}
        />
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

      {/* ---------- Ubicación para recoger ---------- */}
      <section className="booking-block booking-pickup dot-edges">
        <h2>Todos los pedidos son para recoger en el local</h2>
        <p className="booking-pickup-address">{BUSINESS.addressLine}</p>
        <p className="booking-pickup-sub">
          {BUSINESS.city} · Estación de metro más cercana: {BUSINESS.nearestMetro}
        </p>
        <a className="btn btn-accent" href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">
          Abrir en Google Maps
        </a>
      </section>

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
    </>
  );
}
