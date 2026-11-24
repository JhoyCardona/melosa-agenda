import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAdminAuth } from '../context/AdminAuth';
import PasswordPrompt from '../components/PasswordPrompt';
import MoneyInput from '../components/MoneyInput';
import { errorText, onlyDigits } from '../adminUtils';
import type { AlfajorBoxSetting, AlfajorBoxSettings, AlfajorQuantitySetting } from '../types';
import { CATALOG_LINES } from '../catalogLines';
import './adminLegacy.css';
import './cakeSettings.css';

const LINE = CATALOG_LINES.ALFAJOR_UNIT;

// Default packing minutes for a quantity (gretica, Nov 2026): 10 up to 30
// alfajores, 20 above. Only a suggestion.
function defaultMinutes(units: number): number {
  return units <= 30 ? 10 : 20;
}

// "Cajas y cantidades" of small alfajores, shared by every flavor:
//   1. Quantities (x6, x15…), each with its packing minutes on the agenda.
//   2. Boxes (Clásica, Navideña…): name, photo (the small picture the client
//      sees), on/off for the season, and the box price for every quantity ×
//      alfajor size. An empty price = that combination isn't offered.
// New rows start off; the price grid saves with its own button.
export default function AlfajorBoxesPage() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdminAuth();
  const [data, setData] = useState<AlfajorBoxSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'new' = the add-a-box form; otherwise a box id.
  const [boxKey, setBoxKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ message: string; path: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<AlfajorBoxSettings>('/alfajor-boxes');
      setData(res.data);
      setLoadError('');
      return res.data;
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        logout();
        navigate('/admin', { replace: true });
        return null;
      }
      setLoadError(errorText(err, 'No se pudieron cargar las cajas'));
      return null;
    }
  }, [logout, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    load().then((d) => setBoxKey((k) => k ?? d?.boxes[0]?.id ?? 'new'));
  }, [isAdmin, navigate, load]);

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

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { path } = pendingDelete;
    setPendingDelete(null);
    const ok = await run(() => api.delete(path), 'No se pudo eliminar');
    if (ok && path.includes('/boxes/')) setBoxKey('new');
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
  if (!data) {
    return (
      <div className="admin-page">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  const box = data.boxes.find((b) => b.id === boxKey) ?? null;

  return (
    <div className="admin-page cs-page">
      <Link to={LINE.adminHref} className="admin-back">
        ← Atrás
      </Link>
      <h1>Cajas y cantidades · alfajores</h1>
      <p className="edit-hint">
        Esto sirve para todos los sabores. El cliente paga: precio de 1 alfajor × la cantidad + el precio de la
        caja. Lo nuevo nace <strong>desactivado</strong>; actívalo cuando esté listo.
      </p>
      {actionError && <p className="warning cs-banner">{actionError}</p>}

      {/* ─── 1. Quantities ─── */}
      <section className="form-section">
        <h2>1. Cantidades</h2>
        <p className="edit-hint">
          Cuántos alfajores trae cada caja, y los minutos que toma empacarla (los alfajores se hornean aparte, así
          que solo cuenta el empaque).
        </p>
        {data.quantities.length === 0 && <p className="muted">Todavía no hay cantidades.</p>}
        {data.quantities.map((q) => (
          <QuantityRow
            key={q.id}
            quantity={q}
            busy={busy}
            onSave={(changes) =>
              run(() => api.patch(`/alfajor-boxes/quantities/${q.id}`, changes), 'No se pudo editar la cantidad')
            }
            onDelete={() =>
              setPendingDelete({
                message: `¿Eliminar la cantidad x${q.units}? Se borran también sus precios en todas las cajas.`,
                path: `/alfajor-boxes/quantities/${q.id}`,
              })
            }
          />
        ))}
        <NewQuantityForm
          busy={busy}
          onCreate={(body) => run(() => api.post('/alfajor-boxes/quantities', body), 'No se pudo crear la cantidad')}
        />
      </section>

      {/* ─── 2. Boxes ─── */}
      <section className="form-section">
        <h2>2. Cajas</h2>
        <p className="edit-hint">
          Agrega una caja nueva (navideña, halloween…) solo cuando la tengas en todas las cantidades y tamaños.
        </p>
        <div className="cs-chips">
          {data.boxes.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`cs-chip${b.id === boxKey ? ' is-selected' : ''}`}
              onClick={() => setBoxKey(b.id)}
            >
              {b.name}
              {!b.active && ' (apagada)'}
            </button>
          ))}
          <button
            type="button"
            className={`cs-chip cs-chip-add${boxKey === 'new' ? ' is-selected' : ''}`}
            onClick={() => setBoxKey('new')}
          >
            + Nueva caja
          </button>
        </div>

        <BoxForm
          key={boxKey ?? 'new'}
          box={box}
          busy={busy}
          onSave={async (body) => {
            if (box) return run(() => api.patch(`/alfajor-boxes/boxes/${box.id}`, body), 'No se pudo guardar la caja');
            setBusy(true);
            setActionError('');
            try {
              const res = await api.post<{ id: string }>('/alfajor-boxes/boxes', body);
              await load();
              setBoxKey(res.data.id);
              return true;
            } catch (err) {
              setActionError(errorText(err, 'No se pudo crear la caja'));
              return false;
            } finally {
              setBusy(false);
            }
          }}
        />
        {box && (
          <button
            type="button"
            className="link-button cs-danger-link"
            onClick={() =>
              setPendingDelete({
                message: `¿Eliminar la caja "${box.name}"? Se borran también sus precios. Los pedidos ya hechos no cambian.`,
                path: `/alfajor-boxes/boxes/${box.id}`,
              })
            }
          >
            Eliminar la caja "{box.name}"
          </button>
        )}
      </section>

      {box ? (
        <BoxPricesForm key={box.id} box={box} data={data} onSaved={load} />
      ) : (
        <p className="edit-hint">Crea la caja primero para ponerle sus precios.</p>
      )}

      {pendingDelete && (
        <PasswordPrompt
          message={pendingDelete.message}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function QuantityRow({
  quantity,
  busy,
  onSave,
  onDelete,
}: {
  quantity: AlfajorQuantitySetting;
  busy: boolean;
  onSave: (changes: Partial<Pick<AlfajorQuantitySetting, 'units' | 'prepMinutes' | 'active'>>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [units, setUnits] = useState(String(quantity.units));
  const [minutes, setMinutes] = useState(String(quantity.prepMinutes));
  const valid = Number(units) >= 1 && Number(units) <= 200 && Number(minutes) >= 1;

  if (editing) {
    return (
      <div className="cs-row is-editing">
        <div className="cs-two-cols">
          <div>
            <label className="admin-field-label">Alfajores</label>
            <input type="text" inputMode="numeric" value={units} onChange={(e) => setUnits(onlyDigits(e.target.value).slice(0, 3))} />
          </div>
          <div>
            <label className="admin-field-label">Minutos de empaque</label>
            <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(onlyDigits(e.target.value).slice(0, 3))} />
          </div>
        </div>
        <div className="cs-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="secondary-button cs-primary"
            disabled={busy || !valid}
            onClick={async () => {
              if (await onSave({ units: Number(units), prepMinutes: Number(minutes) })) setEditing(false);
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`cs-row${quantity.active ? '' : ' is-inactive'}`}>
      <label className="cs-check cs-row-main">
        <input
          type="checkbox"
          checked={quantity.active}
          disabled={busy}
          onChange={(e) => onSave({ active: e.target.checked })}
        />
        <span>
          <strong>x{quantity.units}</strong>
          <span className="cs-meta">
            {quantity.prepMinutes} min de empaque{!quantity.active && ' · desactivada'}
          </span>
        </span>
      </label>
      <span className="cs-row-buttons">
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => {
            setUnits(String(quantity.units));
            setMinutes(String(quantity.prepMinutes));
            setEditing(true);
          }}
        >
          Editar
        </button>
        <button type="button" className="link-button" disabled={busy} onClick={onDelete}>
          Eliminar
        </button>
      </span>
    </div>
  );
}

function NewQuantityForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (body: { units: number; prepMinutes: number }) => Promise<boolean>;
}) {
  const [units, setUnits] = useState('');
  const [minutes, setMinutes] = useState('');
  const n = Number(units);
  const valid = n >= 1 && n <= 200;

  return (
    <div className="cs-size-form">
      <div className="cs-two-cols">
        <div>
          <label className="admin-field-label">Nueva cantidad (alfajores)</label>
          <input
            type="text"
            inputMode="numeric"
            value={units}
            placeholder="Ej: 15"
            onChange={(e) => setUnits(onlyDigits(e.target.value).slice(0, 3))}
          />
        </div>
        <div>
          <label className="admin-field-label">Minutos de empaque</label>
          <input
            type="text"
            inputMode="numeric"
            value={minutes}
            placeholder={valid ? String(defaultMinutes(n)) : '10'}
            onChange={(e) => setMinutes(onlyDigits(e.target.value).slice(0, 3))}
          />
        </div>
      </div>
      {units !== '' && !valid && <p className="warning">Escribe un número entre 1 y 200.</p>}
      <p className="edit-hint">Minutos vacíos = 10 hasta 30 alfajores, 20 para las más grandes.</p>
      <div className="cs-actions">
        <button
          type="button"
          className="secondary-button cs-primary"
          disabled={busy || !valid}
          onClick={async () => {
            const ok = await onCreate({ units: n, prepMinutes: Number(minutes) > 0 ? Number(minutes) : defaultMinutes(n) });
            if (ok) {
              setUnits('');
              setMinutes('');
            }
          }}
        >
          Agregar cantidad
        </button>
      </div>
    </div>
  );
}

function BoxForm({
  box,
  busy,
  onSave,
}: {
  box: AlfajorBoxSetting | null;
  busy: boolean;
  onSave: (body: { name: string; imageUrl: string | null; active?: boolean }) => Promise<boolean>;
}) {
  const [name, setName] = useState(box?.name ?? '');
  const [imageUrl, setImageUrl] = useState(box?.imageUrl ?? '');
  const [active, setActive] = useState(box?.active ?? false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const changed = !box || name.trim() !== box.name || imageUrl !== (box.imageUrl ?? '') || active !== box.active;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    setSaved('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post<{ imageUrl: string }>('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImageUrl(res.data.imageUrl);
    } catch (err) {
      setError(errorText(err, 'No se pudo subir la foto'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="cs-color-form">
      <label className="admin-field-label">Nombre de la caja</label>
      <input
        type="text"
        value={name}
        placeholder="Ej: Clásica, Navideña"
        onChange={(e) => {
          setName(e.target.value);
          setSaved('');
        }}
      />

      <div className="cs-photo">
        {imageUrl ? <img src={imageUrl} alt={name || 'Foto de la caja'} /> : <span className="muted">Sin foto todavía</span>}
      </div>
      <label className="secondary-button cs-file">
        {uploading ? 'Subiendo foto...' : imageUrl ? 'Cambiar la foto' : 'Agregar la foto'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
      </label>
      <p className="edit-hint">Una sola foto de la caja, para que el cliente vea su decoración.</p>

      {box && (
        <label className="cs-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
              setSaved('');
            }}
          />
          Activa (los clientes la pueden escoger)
        </label>
      )}

      {error && <p className="warning">{error}</p>}
      {saved && <p className="cs-saved">{saved}</p>}
      <div className="cs-actions">
        <button
          type="button"
          className="secondary-button cs-primary"
          disabled={busy || uploading || !changed || name.trim() === ''}
          onClick={async () => {
            const ok = await onSave({ name: name.trim(), imageUrl: imageUrl || null, ...(box ? { active } : {}) });
            if (ok && box) setSaved('Guardado ✔');
          }}
        >
          {box ? 'Guardar caja' : 'Crear caja'}
        </button>
      </div>
    </div>
  );
}

// Price grid of one box: a row per quantity, a column per active alfajor
// size. Empty = not offered.
function BoxPricesForm({
  box,
  data,
  onSaved,
}: {
  box: AlfajorBoxSetting;
  data: AlfajorBoxSettings;
  onSaved: () => Promise<unknown>;
}) {
  const sizes = data.sizes.filter((s) => s.active);
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      Object.entries(box.prices).map(([q, bySize]) => [
        q,
        Object.fromEntries(Object.entries(bySize).map(([s, p]) => [s, String(p)])),
      ])
    )
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function setCell(quantityId: string, sizeId: string, v: string) {
    setDraft((d) => ({ ...d, [quantityId]: { ...(d[quantityId] ?? {}), [sizeId]: v } }));
    setDirty(true);
    setSaved('');
  }

  async function save() {
    setSaving(true);
    setError('');
    setSaved('');
    // Prices of inactive sizes aren't shown but are kept as they were.
    const prices: Record<string, Record<string, number>> = {};
    for (const [q, bySize] of Object.entries(draft)) {
      for (const [s, v] of Object.entries(bySize)) {
        if (v === '' || !data.quantities.some((x) => x.id === q)) continue;
        (prices[q] ??= {})[s] = Number(v);
      }
    }
    try {
      await api.put(`/alfajor-boxes/boxes/${box.id}/prices`, { prices });
      setDirty(false);
      await onSaved();
      setSaved('Precios guardados ✔');
    } catch (err) {
      setError(errorText(err, 'No se pudieron guardar los precios'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="form-section">
      <h2>3. Precio de la caja "{box.name}"</h2>
      <p className="edit-hint">
        Solo lo que cuesta la caja (los alfajores se cobran aparte, con el precio de cada sabor). Vacío = esa
        cantidad no viene en esta caja. Pon 0 si la caja va incluida.
      </p>
      {data.quantities.length === 0 && <p className="edit-hint">Primero agrega las cantidades arriba.</p>}
      {sizes.length === 0 && (
        <p className="edit-hint">No hay tamaños de alfajor activos. Actívalos en "Tamaños y formas".</p>
      )}
      {sizes.length > 0 &&
        data.quantities.map((q) => (
          <div key={q.id} className="cs-size-price">
            <span className="cs-check">
              <span>
                <strong>x{q.units}</strong>
                {!q.active && <span className="cs-meta">desactivada</span>}
              </span>
            </span>
            {sizes.map((s) => (
              <span key={s.id} className="cs-box-price">
                {sizes.length > 1 && <span className="cs-meta">{s.label}</span>}
                <MoneyInput
                  label={`Caja ${box.name} x${q.units}, alfajores ${s.label.toLowerCase()}`}
                  value={draft[q.id]?.[s.id] ?? ''}
                  onChange={(v) => setCell(q.id, s.id, v)}
                />
              </span>
            ))}
          </div>
        ))}
      {sizes.length === 1 && <p className="edit-hint">Precios para alfajores {sizes[0].label.toLowerCase()}.</p>}

      {error && <p className="warning">{error}</p>}
      {saved && <p className="cs-saved">{saved}</p>}
      <button type="button" className="cta-button cs-full" disabled={saving || !dirty} onClick={save}>
        {saving ? 'Guardando...' : dirty ? 'Guardar precios de la caja' : 'Sin cambios por guardar'}
      </button>
    </section>
  );
}
