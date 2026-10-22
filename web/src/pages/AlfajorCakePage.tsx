import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAdminAuth } from '../context/AdminAuth';
import MoneyInput from '../components/MoneyInput';
import { errorText, onlyDigits } from '../adminUtils';
import type { ProductDesign, ProductVariant } from '../types';
import './adminLegacy.css';
import './cakeSettings.css';

// "Torta de alfajor": everything about the one alfajor cake design — its
// decoration photo (also shown on the Landing's alfajor section), whether the
// client may add a print image / a text, and its sizes (portions, minutes on
// the delivery timeline, price, 100%-payment rule).
//
// It's a legacy-catalog design (ProductDesign + ProductVariant rows), so this
// screen reuses the existing /product-designs and /product-variants endpoints.

interface SizeFields {
  label: string;
  portions: number;
  prepMinutes: number;
  price: number;
  enPromocion: boolean;
}

export default function AlfajorCakePage() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdminAuth();

  const [design, setDesign] = useState<ProductDesign | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get<ProductDesign[]>('/product-designs/all');
      setDesign(res.data.find((d) => d.category === 'ALFAJOR_CAKE') ?? null);
      setLoadError('');
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        logout();
        navigate('/admin', { replace: true });
        return;
      }
      setLoadError(errorText(err, 'No se pudo cargar la torta de alfajor'));
    } finally {
      setLoaded(true);
    }
  }, [logout, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    load();
  }, [isAdmin, navigate, load]);

  // One write at a time, then reload, so the screen always shows what's saved.
  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setBusy(true);
    setActionError('');
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setActionError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="admin-page">
        <p className="warning">{loadError}</p>
        <button type="button" className="secondary-button" onClick={load}>
          Reintentar
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="admin-page">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Link to="/admin/alfajores" className="admin-back">
        ← Atrás
      </Link>
      <h1>Torta de alfajor</h1>

      {!design ? (
        <p className="warning">No se encontró la torta de alfajor en el catálogo.</p>
      ) : (
        <>
          <section className="form-section">
            <h2>Foto de la decoración</h2>
            <PhotoForm key={design.imageUrl ?? 'none'} design={design} busy={busy} run={run} />
          </section>

          <section className="form-section">
            <h2>Personalización</h2>
            <CustomizationForm
              key={`${design.allowsCustomImage}-${design.allowsCustomText}-${design.customTextMaxLength}`}
              design={design}
              busy={busy}
              run={run}
            />
          </section>

          <section className="form-section">
            <h2>Tamaños</h2>
            <p className="edit-hint">
              Los minutos son el tiempo que la torta ocupa en la agenda del día de entrega.
            </p>
            {design.variants.map((v) => (
              <SizeRow
                key={v.id}
                variant={v}
                busy={busy}
                onSave={(f) =>
                  run(() => api.patch(`/product-variants/${v.id}`, f), 'No se pudo guardar el tamaño')
                }
                onDelete={() => {
                  if (!window.confirm(`¿Eliminar el tamaño "${v.label}"?`)) return;
                  run(() => api.delete(`/product-variants/${v.id}`), 'No se pudo eliminar el tamaño');
                }}
              />
            ))}
            <NewSizeForm
              busy={busy}
              onCreate={(f) =>
                run(() => api.post(`/product-designs/${design.id}/variants`, f), 'No se pudo crear el tamaño')
              }
            />
          </section>

          {actionError && <p className="warning">{actionError}</p>}
        </>
      )}
    </div>
  );
}

type Run = (action: () => Promise<unknown>, fallback: string) => Promise<boolean>;

// ─── Photo ───

function PhotoForm({ design, busy, run }: { design: ProductDesign; busy: boolean; run: Run }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Picking a file uploads it and saves it right away — there's nothing else
  // to fill in, so a separate "save" button would just be an extra step.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again after an error
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post<{ imageUrl: string }>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await run(
        () => api.patch(`/product-designs/${design.id}`, { imageUrl: res.data.imageUrl }),
        'No se pudo guardar la foto'
      );
    } catch (err) {
      setError(errorText(err, 'No se pudo subir la foto'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="cs-color-form">
      <div className="cs-photo">
        {design.imageUrl ? (
          <img src={design.imageUrl} alt="Torta de alfajor" />
        ) : (
          <span className="muted">Sin foto todavía</span>
        )}
      </div>
      <label className="secondary-button cs-file">
        {uploading ? 'Subiendo foto...' : design.imageUrl ? 'Cambiar la foto' : 'Agregar la foto'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading || busy} />
      </label>
      <p className="edit-hint">
        Esta foto es la que ve el cliente al agendar y en la sección de la torta de alfajor de la página principal.
      </p>
      {error && <p className="warning">{error}</p>}
    </div>
  );
}

// ─── Image / text locks ───

function CustomizationForm({ design, busy, run }: { design: ProductDesign; busy: boolean; run: Run }) {
  const [allowsCustomImage, setAllowsCustomImage] = useState(design.allowsCustomImage);
  const [allowsCustomText, setAllowsCustomText] = useState(design.allowsCustomText);
  const [maxLength, setMaxLength] = useState(String(design.customTextMaxLength));
  const [saved, setSaved] = useState('');

  const changed =
    allowsCustomImage !== design.allowsCustomImage ||
    allowsCustomText !== design.allowsCustomText ||
    (allowsCustomText && Number(maxLength) !== design.customTextMaxLength);
  const valid = !allowsCustomText || (Number(maxLength) >= 1 && Number(maxLength) <= 200);

  async function save() {
    if (!changed || !valid) return;
    setSaved('');
    const ok = await run(
      () =>
        api.patch(`/product-designs/${design.id}`, {
          allowsCustomImage,
          allowsCustomText,
          ...(allowsCustomText && { customTextMaxLength: Number(maxLength) }),
        }),
      'No se pudo guardar la personalización'
    );
    if (ok) setSaved('Guardado ✔');
  }

  return (
    <div>
      <label className="cs-check">
        <input
          type="checkbox"
          checked={!allowsCustomImage}
          onChange={(e) => {
            setAllowsCustomImage(!e.target.checked);
            setSaved('');
          }}
        />
        NO permite imagen personalizada
      </label>
      {allowsCustomImage && (
        <p className="edit-hint cs-indent">
          El cliente sube su imagen (con recargo, no comestible o comestible, igual que en las tortas) o marca
          "No quiero imagen".
        </p>
      )}
      <label className="cs-check">
        <input
          type="checkbox"
          checked={!allowsCustomText}
          onChange={(e) => {
            setAllowsCustomText(!e.target.checked);
            setSaved('');
          }}
        />
        NO permite texto personalizado
      </label>
      {allowsCustomText && (
        <div className="cs-indent">
          <label className="admin-field-label">Máximo de letras del texto</label>
          <input
            type="text"
            inputMode="numeric"
            value={maxLength}
            onChange={(e) => {
              setMaxLength(onlyDigits(e.target.value).slice(0, 3));
              setSaved('');
            }}
          />
        </div>
      )}
      {saved && <p className="cs-saved">{saved}</p>}
      <div className="cs-actions">
        <button
          type="button"
          className="secondary-button cs-primary"
          disabled={!changed || !valid || busy}
          onClick={save}
        >
          Guardar personalización
        </button>
      </div>
    </div>
  );
}

// ─── Sizes ───

// Inputs for creating and editing a size. Numbers stay digit strings while
// typing and only become numbers on submit.
function SizeFieldsForm({
  initial,
  submitText,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: { label: string; portions: string; prepMinutes: string; price: string; enPromocion: boolean };
  submitText: string;
  busy: boolean;
  onSubmit: (fields: SizeFields) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [portions, setPortions] = useState(initial.portions);
  const [prepMinutes, setPrepMinutes] = useState(initial.prepMinutes);
  const [price, setPrice] = useState(initial.price);
  const [enPromocion, setEnPromocion] = useState(initial.enPromocion);

  const valid = label.trim() !== '' && Number(portions) > 0 && Number(prepMinutes) > 0 && Number(price) > 0;

  return (
    <div className="cs-size-form">
      <label className="admin-field-label">Nombre (así lo ve el cliente)</label>
      <input type="text" value={label} placeholder="Ej: 6 porciones" onChange={(e) => setLabel(e.target.value)} />
      <div className="cs-two-cols">
        <div>
          <label className="admin-field-label">Porciones</label>
          <input
            type="text"
            inputMode="numeric"
            value={portions}
            placeholder="Ej: 6"
            onChange={(e) => setPortions(onlyDigits(e.target.value))}
          />
        </div>
        <div>
          <label className="admin-field-label">Minutos que toma hacerla</label>
          <input
            type="text"
            inputMode="numeric"
            value={prepMinutes}
            placeholder="Ej: 20"
            onChange={(e) => setPrepMinutes(onlyDigits(e.target.value))}
          />
        </div>
      </div>
      <label className="admin-field-label">Precio</label>
      <MoneyInput label="Precio" value={price} onChange={setPrice} />
      <label className="cs-check">
        <input type="checkbox" checked={enPromocion} onChange={(e) => setEnPromocion(e.target.checked)} />
        Pago del 100% cuando es lo único del pedido (si piden 2 o más, es el 50%)
      </label>
      <div className="cs-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className="secondary-button cs-primary"
          disabled={!valid || busy}
          onClick={() =>
            onSubmit({
              label: label.trim(),
              portions: Number(portions),
              prepMinutes: Number(prepMinutes),
              price: Number(price),
              enPromocion,
            })
          }
        >
          {submitText}
        </button>
      </div>
    </div>
  );
}

function SizeRow({
  variant,
  busy,
  onSave,
  onDelete,
}: {
  variant: ProductVariant;
  busy: boolean;
  onSave: (fields: SizeFields) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="cs-row is-editing">
        <SizeFieldsForm
          initial={{
            label: variant.label,
            portions: variant.portions ? String(variant.portions) : '',
            prepMinutes: String(variant.prepMinutes),
            price: String(Math.round(Number(variant.price))),
            enPromocion: variant.enPromocion,
          }}
          submitText="Guardar"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSubmit={async (fields) => {
            const ok = await onSave(fields);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </div>
    );
  }

  return (
    <div className="cs-row">
      <span className="cs-row-main">
        <span>
          <strong>{variant.label}</strong>
          <span className="cs-meta">
            ${Number(variant.price).toLocaleString('es-CO')}
            {variant.portions ? ` · ${variant.portions} porciones` : ''} · {variant.prepMinutes} min
            {variant.enPromocion && ' · pago 100% si va sola'}
          </span>
        </span>
      </span>
      <span className="cs-row-buttons">
        <button type="button" className="link-button" disabled={busy} onClick={() => setEditing(true)}>
          Editar
        </button>
        <button type="button" className="link-button" disabled={busy} onClick={onDelete}>
          Eliminar
        </button>
      </span>
    </div>
  );
}

function NewSizeForm({ busy, onCreate }: { busy: boolean; onCreate: (fields: SizeFields) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        + Agregar tamaño
      </button>
    );
  }

  return (
    <div className="cs-new">
      <SizeFieldsForm
        initial={{ label: '', portions: '', prepMinutes: '', price: '', enPromocion: false }}
        submitText="Crear tamaño"
        busy={busy}
        onCancel={() => setOpen(false)}
        onSubmit={async (fields) => {
          const ok = await onCreate(fields);
          if (ok) setOpen(false);
          return ok;
        }}
      />
    </div>
  );
}
