import { useEffect, useState } from 'react';
import api from '../api';
import type { ItemCategory, ProductDesign, ProductVariant } from '../types';

const categoryLabels: Record<ItemCategory, string> = {
  CAKE: 'Torta / Minicake',
  ALFAJOR_CAKE: 'Torta de alfajor',
  ALFAJOR_UNIT: 'Alfajor por unidad',
  CUPCAKE: 'Cupcake',
  DESSERT: 'Postre',
};

interface Props {
  design: ProductDesign;
  onSaved: () => void;
  requestConfirm: (message: string, action: () => Promise<void>) => void;
}

interface VariantEdit {
  label: string;
  price: string;
  points: string;
  prepMinutes: string;
  enPromocion: boolean;
}

function toVariantEdit(v: ProductVariant): VariantEdit {
  return {
    label: v.label,
    price: String(v.price),
    points: String(v.points),
    prepMinutes: String(v.prepMinutes),
    enPromocion: v.enPromocion,
  };
}

export default function EditDesignRow({ design, onSaved, requestConfirm }: Props) {
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(design.name);
  const [category, setCategory] = useState(design.category as ItemCategory);
  const [shape, setShape] = useState(design.shape ?? '');
  const [imageUrl, setImageUrl] = useState(design.imageUrl ?? '');
  const [allowsCustomImage, setAllowsCustomImage] = useState(design.allowsCustomImage);
  const [allowsCustomText, setAllowsCustomText] = useState(design.allowsCustomText);
  const [requiredPaymentPercent, setRequiredPaymentPercent] = useState(String(design.requiredPaymentPercent));
  const [uploading, setUploading] = useState(false);

  const [variants, setVariants] = useState<Record<string, VariantEdit>>(
    Object.fromEntries(design.variants.map((v) => [v.id, toVariantEdit(v)]))
  );
  const [newVariant, setNewVariant] = useState<VariantEdit | null>(null);
  const [error, setError] = useState('');

  // Resync local edit state whenever the design is refetched (after any save,
  // add or delete). Without this, a newly added variant has no entry in
  // `variants` and the render crashes on `variants[v.id].label`.
  useEffect(() => {
    setName(design.name);
    setCategory(design.category as ItemCategory);
    setShape(design.shape ?? '');
    setImageUrl(design.imageUrl ?? '');
    setAllowsCustomImage(design.allowsCustomImage);
    setAllowsCustomText(design.allowsCustomText);
    setRequiredPaymentPercent(String(design.requiredPaymentPercent));
    setVariants(Object.fromEntries(design.variants.map((v) => [v.id, toVariantEdit(v)])));
    setNewVariant(null);
    setError('');
  }, [design]);

  function setVariantField(id: string, patch: Partial<VariantEdit>) {
    setVariants((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post<{ imageUrl: string }>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(res.data.imageUrl);
    } catch {
      setError('No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  }

  function saveDesign() {
    requestConfirm(`Guardar cambios del diseño "${design.name}"`, async () => {
      await api.patch(`/product-designs/${design.id}`, {
        name,
        category,
        shape: shape || null,
        imageUrl: imageUrl || null,
        allowsCustomImage,
        allowsCustomText,
        requiredPaymentPercent: Number(requiredPaymentPercent),
      });
      onSaved();
    });
  }

  function saveVariant(id: string) {
    const v = variants[id];
    requestConfirm(`Guardar cambios del tamaño "${v.label}"`, async () => {
      await api.patch(`/product-variants/${id}`, {
        label: v.label,
        price: Number(v.price),
        points: Number(v.points),
        prepMinutes: Number(v.prepMinutes),
        enPromocion: v.enPromocion,
      });
      onSaved();
    });
  }

  function deleteVariant(id: string, label: string) {
    requestConfirm(`Eliminar el tamaño "${label}"`, async () => {
      await api.delete(`/product-variants/${id}`);
      onSaved();
    });
  }

  function addVariant() {
    if (!newVariant) return;
    const v = newVariant;
    requestConfirm(`Agregar el tamaño "${v.label}" a "${design.name}"`, async () => {
      await api.post(`/product-designs/${design.id}/variants`, {
        label: v.label,
        price: Number(v.price),
        points: Number(v.points),
        prepMinutes: Number(v.prepMinutes),
        enPromocion: v.enPromocion,
      });
      setNewVariant(null);
      onSaved();
    });
  }

  return (
    <div className="edit-design">
      <div className="edit-design-head" onClick={() => setOpen((o) => !o)}>
        <strong>{design.name}</strong>
        <span className="muted">
          {design.variants.length} tamaño{design.variants.length !== 1 ? 's' : ''} · {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {error && <p className="warning">{error}</p>}

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

          <label className="field-label">Forma</label>
          <input type="text" value={shape} onChange={(e) => setShape(e.target.value)} />

          <label className="field-label">Foto</label>
          <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading} />
          {uploading && <p className="muted">Subiendo...</p>}
          {imageUrl && <img className="design-preview" src={imageUrl} alt={name} />}

          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={allowsCustomImage}
              onChange={(e) => setAllowsCustomImage(e.target.checked)}
            />
            Admite imagen personalizada
          </label>
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={allowsCustomText}
              onChange={(e) => setAllowsCustomText(e.target.checked)}
            />
            Admite texto personalizado
          </label>

          <label className="field-label">Abono requerido (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={requiredPaymentPercent}
            onChange={(e) => setRequiredPaymentPercent(e.target.value)}
          />

          <button type="button" className="cta-button" style={{ marginTop: 12 }} onClick={saveDesign}>
            Guardar diseño
          </button>

          <label className="field-label" style={{ marginTop: 20 }}>
            Tamaños
          </label>
          <p className="edit-hint">label · precio · puntos · minutos de agenda · promo</p>

          {design.variants.map((v) => {
            // Fallback covers the render right after a refetch, before the
            // resync effect has repopulated `variants`.
            const e = variants[v.id] ?? toVariantEdit(v);
            return (
              <div key={v.id} className="edit-variant">
                <div className="edit-row">
                  <input
                    type="text"
                    value={e.label}
                    onChange={(ev) => setVariantField(v.id, { label: ev.target.value })}
                  />
                  <input
                    type="number"
                    value={e.price}
                    onChange={(ev) => setVariantField(v.id, { price: ev.target.value })}
                  />
                  <input
                    type="number"
                    value={e.points}
                    onChange={(ev) => setVariantField(v.id, { points: ev.target.value })}
                  />
                  <input
                    type="number"
                    value={e.prepMinutes}
                    onChange={(ev) => setVariantField(v.id, { prepMinutes: ev.target.value })}
                  />
                </div>
                <div className="edit-row">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={e.enPromocion}
                      onChange={(ev) => setVariantField(v.id, { enPromocion: ev.target.checked })}
                    />
                    Promo
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ marginTop: 0 }}
                    onClick={() => saveVariant(v.id)}
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ marginTop: 0 }}
                    onClick={() => deleteVariant(v.id, v.label)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          {newVariant ? (
            <div className="edit-variant">
              <div className="edit-row">
                <input
                  type="text"
                  placeholder="Ej: Torta 10 porciones"
                  value={newVariant.label}
                  onChange={(e) => setNewVariant({ ...newVariant, label: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={newVariant.price}
                  onChange={(e) => setNewVariant({ ...newVariant, price: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Puntos"
                  value={newVariant.points}
                  onChange={(e) => setNewVariant({ ...newVariant, points: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Minutos"
                  value={newVariant.prepMinutes}
                  onChange={(e) => setNewVariant({ ...newVariant, prepMinutes: e.target.value })}
                />
              </div>
              <div className="edit-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={newVariant.enPromocion}
                    onChange={(e) => setNewVariant({ ...newVariant, enPromocion: e.target.checked })}
                  />
                  Promo
                </label>
                <button type="button" className="secondary-button" style={{ marginTop: 0 }} onClick={addVariant}>
                  Agregar
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ marginTop: 0 }}
                  onClick={() => setNewVariant(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setNewVariant({ label: '', price: '', points: '', prepMinutes: '20', enPromocion: false })
              }
            >
              + Agregar tamaño
            </button>
          )}
        </div>
      )}
    </div>
  );
}
