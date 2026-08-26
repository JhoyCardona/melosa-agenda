import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { BlockAvailability, DraftItem, Flavor, ProductDesign, TimeBlock } from '../types';
import './BookingPage.css';

const WHATSAPP_NUMBER = '573172932484';

const flavorLabels: Record<Flavor, string> = { VAINILLA: 'Vainilla', CHOCOLATE: 'Chocolate' };

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface OrderResult {
  id: string;
  ticketNumber: number;
  totalPrice: string;
  requiredPaymentPercent: number;
}

export default function BookingPage() {
  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);

  // Product picker state (current selection being built, not yet added to cart)
  const [selectedDesignId, setSelectedDesignId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [selectedFlavor, setSelectedFlavor] = useState<Flavor>('VAINILLA');
  const [selectedCustomText, setSelectedCustomText] = useState('');
  const [selectedCustomImageUrl, setSelectedCustomImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  const [deliveryDate, setDeliveryDate] = useState('');
  const [availability, setAvailability] = useState<BlockAvailability[] | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | ''>('');
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    api
      .get<ProductDesign[]>('/product-designs')
      .then((res) => {
        setDesigns(res.data);
        if (res.data.length > 0) setSelectedDesignId(res.data[0].id);
      })
      .catch((err) => console.error('Error cargando catálogo:', err));
  }, []);

  useEffect(() => {
    if (!deliveryDate) {
      setAvailability(null);
      setSelectedBlock('');
      return;
    }
    setLoadingAvailability(true);
    setSelectedBlock('');
    api
      .get<BlockAvailability[]>('/public-orders/availability', { params: { date: deliveryDate } })
      .then((res) => setAvailability(res.data))
      .catch((err) => console.error('Error cargando disponibilidad:', err))
      .finally(() => setLoadingAvailability(false));
  }, [deliveryDate]);

  const selectedDesign = designs.find((d) => d.id === selectedDesignId);
  const selectedVariant = selectedDesign?.variants.find((v) => v.id === selectedVariantId);

  useEffect(() => {
    if (selectedDesign && selectedDesign.variants.length > 0 && !selectedVariantId) {
      setSelectedVariantId(selectedDesign.variants[0].id);
    }
  }, [selectedDesign, selectedVariantId]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedDesign) return;

    setImageError('');
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('productDesignId', selectedDesign.id);
      const response = await api.post<{ imageUrl: string }>('/public-orders/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSelectedCustomImageUrl(response.data.imageUrl);
    } catch (error: any) {
      setImageError(error?.response?.data?.error ?? 'No se pudo subir la imagen. Intentá con otra foto.');
    } finally {
      setUploadingImage(false);
    }
  }

  function handleAddItem() {
    if (!selectedDesign || !selectedVariant) return;
    const newItem: DraftItem = {
      key: `${selectedVariant.id}-${Date.now()}`,
      productDesignId: selectedDesign.id,
      productDesignName: selectedDesign.name,
      variantId: selectedVariant.id,
      variantLabel: selectedVariant.label,
      price: Number(selectedVariant.price),
      points: selectedVariant.points,
      flavor: selectedFlavor,
      customText: selectedCustomText || undefined,
      customImageUrl: selectedCustomImageUrl || undefined,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedCustomText('');
    setSelectedCustomImageUrl('');
    setImageError('');
  }

  function handleRemoveItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  const totalPrice = items.reduce((sum, i) => sum + i.price, 0);
  const totalPoints = items.reduce((sum, i) => sum + i.points, 0);

  const canSubmit =
    items.length > 0 && !!deliveryDate && !!selectedBlock && !!clientName && !!clientPhone && !submitting;

  async function handleSubmit() {
    setErrorMessage('');
    setSubmitting(true);
    try {
      const response = await api.post('/public-orders', {
        clientName,
        clientPhone,
        deliveryDate,
        timeBlock: selectedBlock,
        deliveryAddress: deliveryAddress || undefined,
        notes: notes || undefined,
        items: items.map((i) => ({
          productDesignId: i.productDesignId,
          variantId: i.variantId,
          flavor: i.flavor,
          customText: i.customText,
          customImageUrl: i.customImageUrl,
        })),
      });
      setResult(response.data);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.error ?? 'No se pudo enviar el pedido. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const message = encodeURIComponent(
      `Hola! Soy ${clientName}, acabo de agendar el pedido #${result.ticketNumber} por $${Number(
        result.totalPrice
      ).toLocaleString('es-CO')}. Te comparto el comprobante del abono.`
    );
    return (
      <div className="booking-page">
        <div className="confirmation-card">
          <h1>¡Pedido recibido!</h1>
          <p>
            Tu ticket es <strong>#{result.ticketNumber}</strong>.
          </p>
          <p>
            Total: <strong>${Number(result.totalPrice).toLocaleString('es-CO')}</strong>
          </p>
          <p>
            Requiere abono del <strong>{result.requiredPaymentPercent}%</strong>. Mandanos el comprobante por
            WhatsApp para confirmar tu pedido.
          </p>
          <a
            className="whatsapp-button"
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`}
            target="_blank"
            rel="noreferrer"
          >
            Confirmar por WhatsApp
          </a>
          <Link to="/" className="back-link">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <Link to="/" className="back-link">
        ← Volver
      </Link>
      <h1>Agendar pedido</h1>

      <section className="form-section">
        <h2>1. Elegí tu producto</h2>

        {designs.length === 0 ? (
          <p className="muted">Cargando catálogo...</p>
        ) : (
          <>
            <label className="field-label">Diseño</label>
            <select
              value={selectedDesignId}
              onChange={(e) => {
                setSelectedDesignId(e.target.value);
                setSelectedVariantId('');
                setSelectedCustomImageUrl('');
                setImageError('');
              }}
            >
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            {selectedDesign?.imageUrl && (
              <img className="design-preview" src={selectedDesign.imageUrl} alt={selectedDesign.name} />
            )}

            <label className="field-label">Tamaño</label>
            <select value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)}>
              {selectedDesign?.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — ${Number(v.price).toLocaleString('es-CO')}
                </option>
              ))}
            </select>

            <label className="field-label">Sabor</label>
            <div className="flavor-options">
              {(['VAINILLA', 'CHOCOLATE'] as Flavor[]).map((flavor) => (
                <button
                  key={flavor}
                  type="button"
                  className={`chip ${selectedFlavor === flavor ? 'chip-active' : ''}`}
                  onClick={() => setSelectedFlavor(flavor)}
                >
                  {flavorLabels[flavor]}
                </button>
              ))}
            </div>

            <label className="field-label">Texto personalizado (opcional)</label>
            <input
              type="text"
              placeholder="Ej: Feliz cumpleaños Ana"
              value={selectedCustomText}
              onChange={(e) => setSelectedCustomText(e.target.value)}
            />

            {selectedDesign?.allowsCustomImage && (
              <>
                <label className="field-label">Imagen para imprimir (opcional)</label>
                <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploadingImage} />
                {uploadingImage && <p className="muted">Subiendo imagen...</p>}
                {imageError && <p className="warning">{imageError}</p>}
                {selectedCustomImageUrl && (
                  <img className="design-preview" src={selectedCustomImageUrl} alt="Imagen personalizada" />
                )}
              </>
            )}

            <button
              type="button"
              className="secondary-button"
              onClick={handleAddItem}
              disabled={!selectedVariant || uploadingImage}
            >
              + Agregar al pedido
            </button>
          </>
        )}

        {items.length > 0 && (
          <ul className="cart-list">
            {items.map((item) => (
              <li key={item.key}>
                <span>
                  {item.productDesignName} - {item.variantLabel} ({flavorLabels[item.flavor]})
                </span>
                <span className="cart-item-right">
                  ${item.price.toLocaleString('es-CO')}
                  <button type="button" onClick={() => handleRemoveItem(item.key)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="form-section">
        <h2>2. Fecha y hora de entrega</h2>
        <input
          type="date"
          min={todayDateString()}
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
        />

        {loadingAvailability && <p className="muted">Consultando disponibilidad...</p>}

        {availability && availability.length === 0 && (
          <p className="warning">Ese día no agendamos (domingo o festivo). Elegí otra fecha.</p>
        )}

        {availability && availability.length > 0 && (
          <div className="block-grid">
            {availability.map((block) => {
              const fits = block.pointsAvailable >= totalPoints && totalPoints > 0;
              const disabled = totalPoints === 0 || !fits;
              return (
                <button
                  key={block.block}
                  type="button"
                  className={`chip ${selectedBlock === block.block ? 'chip-active' : ''}`}
                  disabled={disabled}
                  onClick={() => setSelectedBlock(block.block)}
                >
                  {block.label}
                  {disabled && totalPoints > 0 ? ' (lleno)' : ''}
                </button>
              );
            })}
          </div>
        )}
        {totalPoints === 0 && <p className="muted">Agregá al menos un producto para ver los bloques disponibles.</p>}
      </section>

      <section className="form-section">
        <h2>3. Tus datos</h2>
        <label className="field-label">Nombre completo</label>
        <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} />

        <label className="field-label">Teléfono</label>
        <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />

        <label className="field-label">Dirección de entrega (opcional)</label>
        <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />

        <label className="field-label">Notas (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>

      <div className="summary-bar">
        <span>Total: ${totalPrice.toLocaleString('es-CO')}</span>
        {errorMessage && <p className="warning">{errorMessage}</p>}
        <button type="button" className="cta-button" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? 'Enviando...' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  );
}
