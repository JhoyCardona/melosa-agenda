import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import type { Flavor, ProductDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import PasswordPrompt from '../components/PasswordPrompt';
import RellenoSelect from '../components/RellenoSelect';
import { rellenoSurcharge } from '../config';
import './adminLegacy.css';

interface CatalogLine {
  kind: 'catalog';
  key: string;
  designId: string;
  variantId: string;
  flavor: Flavor;
  relleno: string;
  customText: string;
  customImageUrl: string;
}
interface FreeLine {
  kind: 'free';
  key: string;
  customName: string;
  price: string;
  customSize: string;
  shape: string;
  customFlavor: string;
  relleno: string;
  customText: string;
  customImageUrl: string;
}
type Line = CatalogLine | FreeLine;

const MAX_CLIENT_NAME = 120;
const MAX_NOTES = 500;

function newKey(): string {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// "15:30" -> 930 minutes from midnight. Empty -> null.
function timeToMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminAuth();

  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [deposit, setDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState('');
  const [checkingOverlap, setCheckingOverlap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    api
      .get<ProductDesign[]>('/product-designs/all')
      .then((res) => setDesigns(res.data))
      .catch(() => setError('No se pudo cargar el catálogo'));
  }, [isAdmin, navigate]);

  const total = useMemo(() => {
    return lines.reduce((sum, l) => {
      if (l.kind === 'free') return sum + (Number(l.price) || 0);
      const design = designs.find((d) => d.id === l.designId);
      const variant = design?.variants.find((v) => v.id === l.variantId);
      if (!variant) return sum;
      return sum + Number(variant.price) + rellenoSurcharge(l.relleno, variant.portions, variant.enPromocion);
    }, 0);
  }, [lines, designs]);

  function patchLine(key: string, patch: Partial<CatalogLine> & Partial<FreeLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function addCatalogLine() {
    const first = designs[0];
    const firstVariant = first?.variants[0];
    setLines((prev) => [
      ...prev,
      {
        kind: 'catalog',
        key: newKey(),
        designId: first?.id ?? '',
        variantId: firstVariant?.id ?? '',
        flavor: 'VAINILLA',
        relleno: firstVariant?.enPromocion ? 'Vainilla' : '',
        customText: '',
        customImageUrl: '',
      },
    ]);
  }
  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      {
        kind: 'free',
        key: newKey(),
        customName: '',
        price: '',
        customSize: '',
        shape: '',
        customFlavor: '',
        relleno: '',
        customText: '',
        customImageUrl: '',
      },
    ]);
  }

  async function uploadPhoto(key: string, file: File) {
    setUploadingKey(key);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.post<{ imageUrl: string }>('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      patchLine(key, { customImageUrl: res.data.imageUrl });
    } catch {
      setError('No se pudo subir la foto');
    } finally {
      setUploadingKey(null);
    }
  }

  const pickupMinutes = timeToMinutes(pickupTime);
  const canSubmit =
    !!clientName.trim() &&
    !!clientPhone.trim() &&
    !!deliveryDate &&
    pickupMinutes !== null &&
    lines.length > 0 &&
    lines.every((l) =>
      l.kind === 'catalog'
        ? l.designId && l.variantId && l.relleno.trim()
        : l.customName.trim() &&
          l.price !== '' &&
          Number(l.price) >= 0 &&
          l.customSize.trim() &&
          l.shape.trim() &&
          l.customFlavor.trim() &&
          l.relleno.trim()
    ) &&
    !submitting;

  interface ExistingOrder {
    ticketNumber: number;
    clientName: string;
    deliveryDate: string;
    deliveryStartMinutes: number;
    deliveryDurationMin: number;
    status: string;
  }

  // Soft warning only — the admin freeform channel intentionally allows
  // overlapping/odd-hour bookings (family orders, custom slots), so this never
  // blocks submission, it just makes sure Melosa notices before confirming.
  async function checkOverlapThenConfirm() {
    if (pickupMinutes === null || !deliveryDate) {
      setPendingConfirm(true);
      return;
    }
    setCheckingOverlap(true);
    try {
      const [year, month] = deliveryDate.split('-').map(Number);
      const res = await api.get<ExistingOrder[]>('/orders', { params: { month, year } });
      const clash = res.data.find((o) => {
        if (o.status === 'CANCELLED') return false;
        if (o.deliveryDate.slice(0, 10) !== deliveryDate) return false;
        const start = o.deliveryStartMinutes;
        const end = start + Math.max(o.deliveryDurationMin, 1);
        return pickupMinutes >= start && pickupMinutes < end;
      });
      if (clash) {
        setOverlapWarning(
          `Ese horario ya está ocupado por el pedido de ${clash.clientName} (#${clash.ticketNumber}). ¿Deseas continuar de todas formas?`
        );
      } else {
        setPendingConfirm(true);
      }
    } catch {
      // Can't verify — don't block the admin over it, just proceed normally.
      setPendingConfirm(true);
    } finally {
      setCheckingOverlap(false);
    }
  }

  async function doCreate() {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ ticketNumber: number }>('/orders', {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        deliveryDate,
        deliveryStartMinutes: pickupMinutes,
        depositPaid: deposit ? Number(deposit) : undefined,
        notes: notes.trim() || undefined,
        items: lines.map((l) =>
          l.kind === 'catalog'
            ? {
                productDesignId: l.designId,
                variantId: l.variantId,
                flavor: l.flavor,
                relleno: l.relleno.trim(),
                customText: l.customText.trim() || undefined,
                customImageUrl: l.customImageUrl || undefined,
              }
            : {
                customName: l.customName.trim(),
                priceAtOrder: Number(l.price),
                customSize: l.customSize.trim(),
                shape: l.shape.trim(),
                customFlavor: l.customFlavor.trim(),
                relleno: l.relleno.trim(),
                customText: l.customText.trim() || undefined,
                customImageUrl: l.customImageUrl || undefined,
              }
        ),
      });
      setCreatedTicket(res.data.ticketNumber);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo crear el pedido');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setClientName('');
    setClientPhone('');
    setDeliveryDate('');
    setPickupTime('');
    setDeposit('');
    setNotes('');
    setLines([]);
    setCreatedTicket(null);
  }

  if (createdTicket !== null) {
    return (
      <div className="booking-page">
        <h1>Pedido creado</h1>
        <p className="form-section">
          Ticket <strong>#{createdTicket}</strong>
          {deposit && Number(deposit) > 0
            ? ' · creado como ABONADO'
            : ' · queda en espera de pago'}
        </p>
        <button type="button" className="cta-button" onClick={resetForm}>
          Crear otro
        </button>{' '}
        <Link className="secondary-button" to="/catalogo">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <Link to="/" className="booking-back">
        ← Volver al inicio
      </Link>
      <h1>Crear pedido</h1>
      <p className="edit-hint">
        Canal de administradora: sin validación de fecha ni hora, no ocupa la agenda pública.
      </p>

      <div className="form-section">
        <h2>Cliente</h2>
        <label className="field-label">Nombre</label>
        <input
          type="text"
          maxLength={MAX_CLIENT_NAME}
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
        <label className="field-label">Teléfono</label>
        <input type="text" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
      </div>

      <div className="form-section">
        <h2>Entrega</h2>
        <label className="field-label">Fecha</label>
        <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        <label className="field-label">Hora de recogida</label>
        <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
      </div>

      <div className="form-section">
        <h2>Productos</h2>
        {lines.length === 0 && <p className="muted">Agrega al menos un producto o una línea libre.</p>}

        {lines.map((l, i) => (
          <div key={l.key} className="edit-variant">
            <div className="edit-row" style={{ justifyContent: 'space-between' }}>
              <strong>
                {i + 1}. {l.kind === 'catalog' ? 'Del catálogo' : 'Línea libre'}
              </strong>
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 0 }}
                onClick={() => removeLine(l.key)}
              >
                ✕
              </button>
            </div>

            {l.kind === 'catalog' ? (
              <>
                <select
                  value={l.designId}
                  onChange={(e) => {
                    const d = designs.find((x) => x.id === e.target.value);
                    const v = d?.variants[0];
                    patchLine(l.key, {
                      designId: e.target.value,
                      variantId: v?.id ?? '',
                      relleno: v?.enPromocion ? 'Vainilla' : '',
                    });
                  }}
                >
                  {designs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <select
                  value={l.variantId}
                  onChange={(e) => {
                    const v = designs.find((d) => d.id === l.designId)?.variants.find((x) => x.id === e.target.value);
                    patchLine(l.key, { variantId: e.target.value, relleno: v?.enPromocion ? 'Vainilla' : '' });
                  }}
                >
                  {designs
                    .find((d) => d.id === l.designId)
                    ?.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} — ${Number(v.price).toLocaleString('es-CO')}
                      </option>
                    ))}
                </select>
                <select
                  value={l.flavor}
                  onChange={(e) => patchLine(l.key, { flavor: e.target.value as Flavor })}
                >
                  <option value="VAINILLA">Vainilla</option>
                  <option value="CHOCOLATE">Chocolate</option>
                </select>
                {(() => {
                  const variant = designs.find((d) => d.id === l.designId)?.variants.find((v) => v.id === l.variantId);
                  return variant ? (
                    <RellenoSelect
                      portions={variant.portions}
                      isPromo={variant.enPromocion}
                      value={l.relleno}
                      onChange={(relleno) => patchLine(l.key, { relleno })}
                    />
                  ) : null;
                })()}
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Descripción (ej: Torta 3 leches frutos rojos)"
                  value={l.customName}
                  onChange={(e) => patchLine(l.key, { customName: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={l.price}
                  onChange={(e) => patchLine(l.key, { price: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Porciones (ej: 20 porciones)"
                  value={l.customSize}
                  onChange={(e) => patchLine(l.key, { customSize: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Forma (ej: Corazón)"
                  value={l.shape}
                  onChange={(e) => patchLine(l.key, { shape: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Sabor de torta"
                  value={l.customFlavor}
                  onChange={(e) => patchLine(l.key, { customFlavor: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Relleno"
                  value={l.relleno}
                  onChange={(e) => patchLine(l.key, { relleno: e.target.value })}
                />
              </>
            )}

            <input
              type="text"
              placeholder="Texto personalizado (opcional)"
              value={l.customText}
              onChange={(e) => patchLine(l.key, { customText: e.target.value })}
            />
            <input
              type="file"
              accept="image/*"
              disabled={uploadingKey === l.key}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(l.key, f);
              }}
            />
            {uploadingKey === l.key && <p className="muted">Subiendo...</p>}
            {l.customImageUrl && <img className="design-preview" src={l.customImageUrl} alt="" />}
          </div>
        ))}

        <button type="button" className="secondary-button" onClick={addCatalogLine} disabled={designs.length === 0}>
          + Producto del catálogo
        </button>{' '}
        <button type="button" className="secondary-button" onClick={addFreeLine}>
          + Línea libre
        </button>
      </div>

      <div className="form-section">
        <h2>Pago y origen</h2>
        <label className="field-label">Abono recibido (opcional — si lo pones, el pedido queda ABONADO)</label>
        <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        <label className="field-label">Notas</label>
        <textarea maxLength={MAX_NOTES} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <p style={{ fontWeight: 700 }}>Total: ${total.toLocaleString('es-CO')}</p>
      {error && <p className="warning">{error}</p>}

      <button
        type="button"
        className="cta-button"
        disabled={!canSubmit || checkingOverlap}
        onClick={checkOverlapThenConfirm}
      >
        {checkingOverlap ? 'Revisando horario...' : submitting ? 'Creando...' : 'Crear pedido'}
      </button>

      {overlapWarning && (
        <div className="pw-overlay" role="dialog" aria-modal="true">
          <div className="pw-box">
            <p className="pw-message">Horario ocupado</p>
            <p className="pw-sub">{overlapWarning}</p>
            <div className="pw-actions">
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 0 }}
                onClick={() => setOverlapWarning('')}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cta-button"
                style={{ marginTop: 0 }}
                onClick={() => {
                  setOverlapWarning('');
                  setPendingConfirm(true);
                }}
              >
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingConfirm && (
        <PasswordPrompt
          message={`Crear pedido para ${clientName || 'cliente'} · $${total.toLocaleString('es-CO')}`}
          onConfirm={() => {
            setPendingConfirm(false);
            doCreate();
          }}
          onCancel={() => setPendingConfirm(false)}
        />
      )}
    </div>
  );
}
