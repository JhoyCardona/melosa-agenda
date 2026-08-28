import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import type { ItemCategory, ProductDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import PasswordPrompt from '../components/PasswordPrompt';
import EditDesignRow from '../components/EditDesignRow';
import './adminLegacy.css';

const categoryLabels: Record<ItemCategory, string> = {
  CAKE: 'Torta / Minicake',
  ALFAJOR_CAKE: 'Torta de alfajor',
  ALFAJOR_UNIT: 'Alfajor por unidad',
  CUPCAKE: 'Cupcake',
  DESSERT: 'Postre',
};

interface VariantDraft {
  key: string;
  label: string;
  price: string;
  points: string;
  prepMinutes: string;
  enPromocion: boolean;
}

function emptyVariant(): VariantDraft {
  return {
    key: `v-${Date.now()}-${Math.random()}`,
    label: '',
    price: '',
    points: '',
    prepMinutes: '20',
    enPromocion: false,
  };
}

export default function CatalogAdminPage() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdminAuth();
  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('CAKE');
  const [shape, setShape] = useState('');
  const [allowsCustomImage, setAllowsCustomImage] = useState(false);
  const [allowsCustomText, setAllowsCustomText] = useState(true);
  const [requiredPaymentPercent, setRequiredPaymentPercent] = useState('100');
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Password-gated edit actions on existing products (Fase 6).
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    action: () => Promise<void>;
  } | null>(null);
  const [editError, setEditError] = useState('');

  function requestConfirm(message: string, action: () => Promise<void>) {
    setEditError('');
    setPendingConfirm({ message, action });
  }

  async function runConfirmed() {
    if (!pendingConfirm) return;
    const { action } = pendingConfirm;
    setPendingConfirm(null);
    try {
      await action();
    } catch (err) {
      setEditError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'No se pudo guardar el cambio'
      );
    }
  }

  function loadDesigns() {
    setLoadingList(true);
    api
      .get<ProductDesign[]>('/product-designs/all')
      .then((res) => setDesigns(res.data))
      .catch((err) => {
        if (err?.response?.status === 401) {
          logout();
          navigate('/admin');
        }
      })
      .finally(() => setLoadingList(false));
  }

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    loadDesigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await api.post<{ imageUrl: string }>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(response.data.imageUrl);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo subir la foto');
    } finally {
      setUploadingImage(false);
    }
  }

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    setVariants((prev) => [...prev, emptyVariant()]);
  }

  function removeVariant(key: string) {
    setVariants((prev) => (prev.length > 1 ? prev.filter((v) => v.key !== key) : prev));
  }

  function resetForm() {
    setName('');
    setCategory('CAKE');
    setShape('');
    setAllowsCustomImage(false);
    setAllowsCustomText(true);
    setRequiredPaymentPercent('100');
    setImageUrl('');
    setVariants([emptyVariant()]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!name.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (variants.some((v) => !v.label.trim() || v.price === '' || v.points === '' || v.prepMinutes === '')) {
      setError('Completa label, precio, puntos y minutos en todos los tamaños');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/product-designs', {
        name,
        category,
        shape: shape || undefined,
        imageUrl: imageUrl || undefined,
        allowsCustomImage,
        allowsCustomText,
        requiredPaymentPercent: Number(requiredPaymentPercent),
        variants: variants.map((v) => ({
          label: v.label,
          price: Number(v.price),
          points: Number(v.points),
          prepMinutes: Number(v.prepMinutes),
          enPromocion: v.enPromocion,
        })),
      });
      setSuccessMessage('Producto agregado al catálogo');
      resetForm();
      loadDesigns();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo guardar el producto');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/admin');
  }

  return (
    <div className="booking-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Catálogo</h1>
        <button type="button" className="secondary-button" style={{ marginTop: 0 }} onClick={handleLogout}>
          Salir
        </button>
      </div>

      <form className="form-section" onSubmit={handleSubmit}>
        <h2>Agregar producto nuevo</h2>

        <label className="field-label">Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="field-label">Categoría</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
          {(Object.keys(categoryLabels) as ItemCategory[]).map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>

        <label className="field-label">Forma (opcional, ej: Corazón, Redonda)</label>
        <input type="text" value={shape} onChange={(e) => setShape(e.target.value)} />

        <label className="field-label">Foto</label>
        <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploadingImage} />
        {uploadingImage && <p className="muted">Subiendo foto...</p>}
        {imageUrl && <img className="design-preview" src={imageUrl} alt="Vista previa" />}

        <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={allowsCustomImage}
            onChange={(e) => setAllowsCustomImage(e.target.checked)}
          />
          Admite imagen personalizada del cliente (para imprimir)
        </label>

        <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={allowsCustomText}
            onChange={(e) => setAllowsCustomText(e.target.checked)}
          />
          Admite texto personalizado (frase o número)
        </label>

        <label className="field-label">Abono requerido (%)</label>
        <input
          type="number"
          min={1}
          max={100}
          value={requiredPaymentPercent}
          onChange={(e) => setRequiredPaymentPercent(e.target.value)}
        />

        <label className="field-label" style={{ marginTop: 16 }}>
          Tamaños
        </label>
        {variants.map((v) => (
          <div
            key={v.key}
            style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <input
              type="text"
              placeholder="Ej: Torta 10 porciones"
              value={v.label}
              onChange={(e) => updateVariant(v.key, { label: e.target.value })}
              style={{ flex: 2, minWidth: 140 }}
            />
            <input
              type="number"
              placeholder="Precio"
              value={v.price}
              onChange={(e) => updateVariant(v.key, { price: e.target.value })}
              style={{ flex: 1, minWidth: 90 }}
            />
            <input
              type="number"
              placeholder="Puntos"
              value={v.points}
              onChange={(e) => updateVariant(v.key, { points: e.target.value })}
              style={{ flex: 1, minWidth: 80 }}
            />
            <input
              type="number"
              placeholder="Minutos de agenda"
              title="Minutos que ocupa en la agenda de entregas"
              value={v.prepMinutes}
              onChange={(e) => updateVariant(v.key, { prepMinutes: e.target.value })}
              style={{ flex: 1, minWidth: 90 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={v.enPromocion}
                onChange={(e) => updateVariant(v.key, { enPromocion: e.target.checked })}
              />
              Promo
            </label>
            <button type="button" className="secondary-button" style={{ marginTop: 0 }} onClick={() => removeVariant(v.key)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="secondary-button" onClick={addVariant}>
          + Agregar tamaño
        </button>

        {error && <p className="warning">{error}</p>}
        {successMessage && <p style={{ color: 'green', fontWeight: 600 }}>{successMessage}</p>}

        <button type="submit" className="cta-button" style={{ marginTop: 16 }} disabled={submitting || uploadingImage}>
          {submitting ? 'Guardando...' : 'Guardar producto'}
        </button>
      </form>

      <section className="form-section">
        <h2>Productos existentes</h2>
        <p className="edit-hint">Toca un producto para editarlo. Cada cambio pide tu contraseña.</p>
        {editError && <p className="warning">{editError}</p>}
        {loadingList ? (
          <p className="muted">Cargando...</p>
        ) : designs.length === 0 ? (
          <p className="muted">Todavía no hay productos cargados</p>
        ) : (
          designs.map((d) => (
            <EditDesignRow
              key={d.id}
              design={d}
              onSaved={loadDesigns}
              requestConfirm={requestConfirm}
            />
          ))
        )}
      </section>

      {pendingConfirm && (
        <PasswordPrompt
          message={pendingConfirm.message}
          onConfirm={runConfirmed}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
