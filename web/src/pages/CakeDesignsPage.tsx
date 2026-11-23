import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAdminAuth } from '../context/AdminAuth';
import PasswordPrompt from '../components/PasswordPrompt';
import MoneyInput from '../components/MoneyInput';
import { errorText, onlyDigits } from '../adminUtils';
import type { CakeDesignV2, CakeSettings, DesignColorConfig } from '../types';
import { CATALOG_LINES, lineWords, type CatalogLine } from '../catalogLines';
import './adminLegacy.css';
import './cakeSettings.css';

// "Modificar / agregar diseños" (catalog v2), following the admin sketch:
//   1. Pick a design with the search bar (or type a new name) + its
//      customization flags (image / text), which are per design.
//   2. Its colors: name + photo each.
//   3. For the selected color: allowed bizcochos, rellenos and shapes, and the
//      offered sizes with this color's price.
// Each block remounts (React `key`) when the design/color changes, so a form
// can never carry values over from another color.
//
// Small alfajores use the same screen with their own words (lineWords): a
// design is a box with its alfajor count and packing minutes, and colors are
// packagings. Boxes are never personalized, so the image/text flags are hidden.

type Words = ReturnType<typeof lineWords>;

// Default packing minutes for a box (gretica, Nov 2026): 10 up to 30 alfajores,
// 20 above. Only a suggestion; each box can set its own.
function defaultBoxMinutes(units: number): number {
  return units <= 30 ? 10 : 20;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export default function CakeDesignsPage({ category = 'CAKE' }: { category?: CatalogLine }) {
  const line = CATALOG_LINES[category];
  const w = lineWords(line);
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdminAuth();

  const [designs, setDesigns] = useState<CakeDesignV2[] | null>(null);
  const [settings, setSettings] = useState<CakeSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Unsaved sizes/flavors on the selected color — guards switching away.
  const [configDirty, setConfigDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        api.get<CakeDesignV2[]>('/cake-designs', { params: { category } }),
        api.get<CakeSettings>('/cake-settings', { params: { category } }),
      ]);
      setDesigns(d.data);
      setSettings(s.data);
      setLoadError('');
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        logout();
        navigate('/admin', { replace: true });
        return;
      }
      setLoadError(errorText(err, 'No se pudo cargar la lista'));
    }
  }, [logout, navigate, category]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    load();
  }, [isAdmin, navigate, load]);

  useEffect(() => {
    if (!configDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [configDirty]);

  const selected = designs?.find((d) => d.id === selectedId) ?? null;

  const matches = useMemo(() => {
    const q = normalize(search);
    if (!designs || q === '') return [];
    return designs.filter((d) => normalize(d.name).includes(q)).slice(0, 8);
  }, [designs, search]);

  // Leaving a color with unsaved changes asks first.
  function confirmLeave(): boolean {
    if (!configDirty) return true;
    const ok = window.confirm(`Tienes cambios sin guardar en este ${w.color}. ¿Salir sin guardarlos?`);
    if (ok) setConfigDirty(false);
    return ok;
  }

  function selectDesign(id: string | null) {
    if (id === selectedId || !confirmLeave()) return;
    setSelectedId(id);
    setSearch('');
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

  if (!designs || !settings) {
    return (
      <div className="admin-page">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="admin-page cs-page">
      <Link to={line.adminHref} className="admin-back">
        ← Atrás
      </Link>
      <h1>
        Modificar / agregar {w.designs}
        {line.adminSuffix}
      </h1>

      {/* ─── 1. Name ─── */}
      <section className="form-section">
        <h2>1. {line.boxes ? 'Caja' : 'Diseño'}</h2>
        <label className="admin-field-label">
          Buscar {line.boxes ? 'una caja para editarla' : 'un diseño para editarlo'} ({designs.length} en total)
        </label>
        <input
          type="text"
          value={search}
          placeholder="Escribe parte del nombre"
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() !== '' && (
          <ul className="cs-matches">
            {matches.length === 0 && <li className="muted">Ningún resultado coincide.</li>}
            {matches.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => selectDesign(d.id)}>
                  {d.imageUrl ? <img src={d.imageUrl} alt="" /> : <span className="cs-thumb-empty" />}
                  <span>
                    {d.name}
                    <span className="cs-meta">
                      {d.colors.length} {d.colors.length === 1 ? w.color : w.colors}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="cs-editing-label">
          {selected ? (
            <>
              Editando: <strong>{selected.name}</strong>
              <button type="button" className="link-button" onClick={() => selectDesign(null)}>
                {line.boxes ? 'Crear otra caja' : 'Crear otro diseño'}
              </button>
            </>
          ) : (
            <>{line.boxes ? 'Caja nueva' : 'Diseño nuevo'}</>
          )}
        </div>

        <DesignForm
          key={selectedId ?? 'new'}
          category={category}
          boxes={line.boxes}
          design={selected}
          sizes={settings.sizes.filter((sz) => sz.active)}
          onSaved={async (id) => {
            await load();
            setSelectedId(id);
          }}
        />
      </section>

      {selected ? (
        <ColorsSection
          key={selected.id}
          design={selected}
          allDesigns={designs}
          settings={settings}
          configDirty={configDirty}
          setConfigDirty={setConfigDirty}
          confirmLeave={confirmLeave}
          reload={load}
          w={w}
          boxes={line.boxes}
          shapes={line.shapes}
        />
      ) : (
        <p className="edit-hint">
          {line.boxes
            ? 'Crea o selecciona una caja para agregarle empaques, sabores y tamaños.'
            : 'Crea o selecciona un diseño para agregarle colores, sabores y tamaños.'}
        </p>
      )}
    </div>
  );
}

// ─── 1. Design name + customization ───

function DesignForm({
  category,
  boxes,
  design,
  sizes,
  onSaved,
}: {
  category: CatalogLine;
  boxes: boolean;
  design: CakeDesignV2 | null;
  sizes: CakeSettings['sizes'];
  onSaved: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(design?.name ?? '');
  // Cupcakes: only an image (one per cupcake, or one repeated), never a text.
  const cupcakes = category === 'CUPCAKE';
  // A new design allows both image and text by default (most do); the
  // checkboxes below are phrased as the opt-out ("NO permite…").
  const [allowsCustomImage, setAllowsCustomImage] = useState(design?.allowsCustomImage ?? true);
  const [requiresCustomImage, setRequiresCustomImage] = useState(design?.requiresCustomImage ?? false);
  const [allowsCustomText, setAllowsCustomText] = useState(cupcakes ? false : design?.allowsCustomText ?? true);
  const [maxLength, setMaxLength] = useState(String(design?.customTextMaxLength ?? 20));
  // Alfajor boxes only, as digit strings while typing. Empty minutes = the
  // default for that box size (defaultBoxMinutes).
  const [units, setUnits] = useState(design?.unitsPerBox ? String(design.unitsPerBox) : '');
  const [boxMinutes, setBoxMinutes] = useState(design?.prepMinutes ? String(design.prepMinutes) : '');
  // Per-size cap on print images, as digit strings while typing ('' = 1).
  const [imageLimits, setImageLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(design?.imageLimits ?? {}).map(([id, n]) => [id, String(n)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const unitsNum = Number(units);
  const validUnits = unitsNum >= 1 && unitsNum <= 200;
  const valid = boxes
    ? name.trim() !== '' && validUnits
    : name.trim() !== '' && (!allowsCustomText || Number(maxLength) > 0);

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError('');
    setSaved('');
    const body = boxes
      ? {
          name: name.trim(),
          // Boxes are never personalized.
          allowsCustomImage: false,
          requiresCustomImage: false,
          allowsCustomText: false,
          unitsPerBox: unitsNum,
          prepMinutes: Number(boxMinutes) > 0 ? Math.min(300, Number(boxMinutes)) : defaultBoxMinutes(unitsNum),
        }
      : {
      name: name.trim(),
      allowsCustomImage,
      requiresCustomImage: allowsCustomImage && requiresCustomImage,
      allowsCustomText: cupcakes ? false : allowsCustomText,
      customTextMaxLength: Number(maxLength) || 20,
      // Only the active sizes shown here; an inactive size keeps whatever it had.
      // Cupcakes store none: the server allows one image per cupcake in the box.
      imageLimits: cupcakes
        ? {}
        : Object.fromEntries(
            sizes.map((sz) => [sz.id, Math.min(20, Math.max(1, Number(imageLimits[sz.id]) || 1))])
          ),
        };
    try {
      const res = design
        ? await api.patch<{ id: string }>(`/cake-designs/${design.id}`, body)
        : await api.post<{ id: string }>('/cake-designs', { ...body, category });
      await onSaved(res.data.id);
      if (design) setSaved('Guardado ✔');
    } catch (err) {
      setError(errorText(err, boxes ? 'No se pudo guardar la caja' : 'No se pudo guardar el diseño'));
    } finally {
      setSaving(false);
    }
  }

  if (boxes) {
    return (
      <div>
        <label className="admin-field-label">Nombre de la caja</label>
        <input
          type="text"
          value={name}
          placeholder="Ej: Caja x15"
          onChange={(e) => {
            setName(e.target.value);
            setSaved('');
          }}
        />
        <p className="edit-hint">Así la ven los clientes en el catálogo. Sirve ponerle la cantidad: "Caja x15".</p>

        <label className="admin-field-label">¿Cuántos alfajores trae la caja?</label>
        <input
          type="text"
          inputMode="numeric"
          value={units}
          placeholder="Ej: 15"
          onChange={(e) => {
            setUnits(onlyDigits(e.target.value).slice(0, 3));
            setSaved('');
          }}
        />
        {units !== '' && !validUnits && <p className="warning">Escribe un número entre 1 y 200.</p>}

        <label className="admin-field-label">Minutos que ocupa en la agenda (empacar)</label>
        <input
          type="text"
          inputMode="numeric"
          value={boxMinutes}
          placeholder={validUnits ? String(defaultBoxMinutes(unitsNum)) : '10'}
          onChange={(e) => {
            setBoxMinutes(onlyDigits(e.target.value).slice(0, 3));
            setSaved('');
          }}
        />
        <p className="edit-hint">
          Vacío = 10 minutos para cajas de hasta 30 alfajores y 20 minutos para las más grandes. Los alfajores se
          hornean aparte, así que solo cuenta el tiempo de empacar.
        </p>

        {error && <p className="warning">{error}</p>}
        {saved && <p className="cs-saved">{saved}</p>}
        <div className="cs-actions">
          <button type="button" className="secondary-button cs-primary" disabled={!valid || saving} onClick={save}>
            {saving ? 'Guardando...' : design ? 'Guardar caja' : 'Crear caja'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="admin-field-label">Nombre del diseño</label>
      <input
        type="text"
        value={name}
        placeholder="Ej: Corazón vintage"
        onChange={(e) => {
          setName(e.target.value);
          setSaved('');
        }}
      />

      {/* Three states on the same two DB flags: none (allowsCustomImage
          false), optional (allows, not required: the client must upload or
          tick "No quiero imágenes"), required (no opt-out offered). */}
      <label className="admin-field-label">Imágenes para imprimir</label>
      {(
        [
          ['none', 'No lleva imagen', 'Al cliente no le aparece nada sobre imágenes.'],
          ['optional', 'Opcional', 'El cliente sube su imagen o marca "No quiero imagen".'],
          ['required', 'Obligatoria', 'El cliente tiene que subir al menos 1 imagen.'],
        ] as const
      ).map(([mode, label, hint]) => {
        const current = !allowsCustomImage ? 'none' : requiresCustomImage ? 'required' : 'optional';
        return (
          <label key={mode} className="cs-check">
            <input
              type="radio"
              name="image-mode"
              checked={current === mode}
              onChange={() => {
                setAllowsCustomImage(mode !== 'none');
                setRequiresCustomImage(mode === 'required');
                setSaved('');
              }}
            />
            <span>
              {label} <span className="edit-hint">— {hint}</span>
            </span>
          </label>
        );
      })}
      {allowsCustomImage && cupcakes && (
        <p className="edit-hint cs-indent">
          El cliente puede subir una imagen por cupcake (hasta la cantidad de la caja), o una sola que se repite en
          todos. Se cobra una vez por caja.
        </p>
      )}
      {allowsCustomImage && !cupcakes && sizes.length > 0 && (
        <div className="cs-indent">
          <label className="admin-field-label">Máximo de imágenes que puede subir el cliente, por tamaño</label>
          <div className="cs-image-limits">
            {sizes.map((sz) => (
              <label key={sz.id}>
                <span>{sz.label}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={imageLimits[sz.id] ?? ''}
                  placeholder="1"
                  onChange={(e) => {
                    setImageLimits((prev) => ({ ...prev, [sz.id]: onlyDigits(e.target.value).slice(0, 2) }));
                    setSaved('');
                  }}
                />
              </label>
            ))}
          </div>
          <p className="edit-hint">Vacío = 1 imagen. Máximo 20.</p>
        </div>
      )}
      {!cupcakes && (
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
      )}
      {allowsCustomText && !cupcakes && (
        <div className="cs-indent">
          <label className="admin-field-label">Máximo de letras del texto</label>
          <input
            type="text"
            inputMode="numeric"
            value={maxLength}
            onChange={(e) => {
              setMaxLength(onlyDigits(e.target.value));
              setSaved('');
            }}
          />
        </div>
      )}

      {error && <p className="warning">{error}</p>}
      {saved && <p className="cs-saved">{saved}</p>}
      <div className="cs-actions">
        <button type="button" className="secondary-button cs-primary" disabled={!valid || saving} onClick={save}>
          {saving ? 'Guardando...' : design ? 'Guardar nombre y personalización' : 'Crear diseño'}
        </button>
      </div>
    </div>
  );
}

// ─── 2. Colors + 3. per-color configuration ───

function ColorsSection({
  design,
  allDesigns,
  settings,
  configDirty,
  setConfigDirty,
  confirmLeave,
  reload,
  w,
  boxes,
  shapes,
}: {
  design: CakeDesignV2;
  allDesigns: CakeDesignV2[];
  settings: CakeSettings;
  configDirty: boolean;
  setConfigDirty: (dirty: boolean) => void;
  confirmLeave: () => boolean;
  reload: () => Promise<void>;
  w: Words;
  boxes: boolean;
  // false for lines without shapes (cupcakes).
  shapes: boolean;
}) {
  // 'new' = the add-a-color form; otherwise a color id.
  const [colorKey, setColorKey] = useState<string>(design.colors[0]?.id ?? 'new');
  const [pendingDelete, setPendingDelete] = useState<DesignColorConfig | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const color = design.colors.find((c) => c.id === colorKey) ?? null;

  function pick(key: string) {
    if (key === colorKey || !confirmLeave()) return;
    setColorKey(key);
    setDeleteError('');
  }

  async function deleteColor() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await api.delete(`/cake-designs/colors/${target.id}`);
      setConfigDirty(false);
      const next = design.colors.find((c) => c.id !== target.id);
      setColorKey(next?.id ?? 'new');
      await reload();
    } catch (err) {
      setDeleteError(errorText(err, `No se pudo eliminar el ${w.color}`));
    }
  }

  return (
    <>
      <section className="form-section">
        <h2>2. {boxes ? 'Empaques' : 'Colores o decoraciones'}</h2>
        <div className="cs-chips">
          {design.colors.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cs-chip${c.id === colorKey ? ' is-selected' : ''}`}
              onClick={() => pick(c.id)}
            >
              {c.colorName}
            </button>
          ))}
          <button
            type="button"
            className={`cs-chip cs-chip-add${colorKey === 'new' ? ' is-selected' : ''}`}
            onClick={() => pick('new')}
          >
            + Nuevo {w.color}
          </button>
        </div>

        <ColorForm
          key={colorKey}
          designId={design.id}
          color={color}
          w={w}
          onSaved={async (savedColorId) => {
            await reload();
            setColorKey(savedColorId);
          }}
        />

        {color && (
          <button
            type="button"
            className="link-button cs-danger-link"
            onClick={() => {
              setDeleteError('');
              setPendingDelete(color);
            }}
          >
            Eliminar el {w.color} "{color.colorName}"
          </button>
        )}
        {deleteError && <p className="warning">{deleteError}</p>}
      </section>

      {color ? (
        <ColorConfigForm
          key={color.id}
          color={color}
          design={design}
          allDesigns={allDesigns}
          settings={settings}
          dirty={configDirty}
          setDirty={setConfigDirty}
          onSaved={reload}
          w={w}
          boxes={boxes}
          usesShapes={shapes}
        />
      ) : (
        <p className="edit-hint">Guarda el {w.color} primero para escoger sus sabores, formas y tamaños.</p>
      )}

      {pendingDelete && (
        <PasswordPrompt
          message={`¿Eliminar el ${w.color} "${pendingDelete.colorName}" de ${boxes ? 'esta caja' : 'este diseño'}? Se borran también sus precios y sabores.`}
          onConfirm={deleteColor}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

function ColorForm({
  designId,
  color,
  w,
  onSaved,
}: {
  designId: string;
  color: DesignColorConfig | null;
  w: Words;
  onSaved: (colorId: string) => Promise<void>;
}) {
  const [colorName, setColorName] = useState(color?.colorName ?? '');
  const [imageUrl, setImageUrl] = useState(color?.imageUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const changed = !color || colorName.trim() !== color.colorName || imageUrl !== color.imageUrl;
  const valid = colorName.trim() !== '' && imageUrl !== '';

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again after an error
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

  async function save() {
    if (!valid || !changed) return;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const body = { colorName: colorName.trim(), imageUrl };
      const res = color
        ? await api.patch<DesignColorConfig>(`/cake-designs/colors/${color.id}`, body)
        : await api.post<DesignColorConfig>(`/cake-designs/${designId}/colors`, body);
      await onSaved(res.data.id);
      if (color) setSaved('Guardado ✔');
    } catch (err) {
      setError(errorText(err, `No se pudo guardar el ${w.color}`));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cs-color-form">
      <label className="admin-field-label">Nombre del {w.color}</label>
      <input
        type="text"
        value={colorName}
        placeholder={w.color === 'empaque' ? 'Ej: Clásico, Navideño' : 'Ej: Rojo'}
        onChange={(e) => {
          setColorName(e.target.value);
          setSaved('');
        }}
      />

      <div className="cs-photo">
        {imageUrl ? (
          <img src={imageUrl} alt={colorName || `Foto del ${w.color}`} />
        ) : (
          <span className="muted">Sin foto todavía</span>
        )}
      </div>
      <label className="secondary-button cs-file">
        {uploading ? 'Subiendo foto...' : imageUrl ? 'Cambiar la foto' : 'Agregar la foto'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
      </label>

      {error && <p className="warning">{error}</p>}
      {saved && <p className="cs-saved">{saved}</p>}
      <div className="cs-actions">
        <button
          type="button"
          className="secondary-button cs-primary"
          disabled={!valid || !changed || saving || uploading}
          onClick={save}
        >
          {saving ? 'Guardando...' : color ? `Guardar nombre y foto del ${w.color}` : `Crear ${w.color}`}
        </button>
      </div>
      {!color && !imageUrl && <p className="edit-hint">Un {w.color} nuevo necesita su foto.</p>}
    </div>
  );
}

// Form state for one color's configuration. Sizes keep the price as digits
// while typing; `checked` is the "size offered" box.
interface ConfigDraft {
  flavorIds: Set<string>;
  shapeIds: Set<string>;
  sizes: Record<string, { checked: boolean; price: string }>;
}

function draftFrom(c: Pick<DesignColorConfig, 'flavorIds' | 'shapeIds' | 'sizePrices'>): ConfigDraft {
  return {
    flavorIds: new Set(c.flavorIds),
    shapeIds: new Set(c.shapeIds),
    sizes: Object.fromEntries(
      Object.entries(c.sizePrices).map(([sizeId, price]) => [sizeId, { checked: true, price: String(price) }])
    ),
  };
}

function ColorConfigForm({
  color,
  design,
  allDesigns,
  settings,
  dirty,
  setDirty,
  onSaved,
  w,
  boxes,
  usesShapes,
}: {
  color: DesignColorConfig;
  design: CakeDesignV2;
  allDesigns: CakeDesignV2[];
  settings: CakeSettings;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
  w: Words;
  boxes: boolean;
  usesShapes: boolean;
}) {
  const [draft, setDraft] = useState<ConfigDraft>(() => draftFrom(color));
  const [copyFrom, setCopyFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  // Only globally active rows are offered. A row that was ticked and later
  // deactivated stays in the draft, so saving here doesn't silently drop it.
  const bizcochos = settings.bizcochos.filter((f) => f.active);
  const rellenos = settings.rellenos.filter((f) => f.active);
  const shapes = settings.shapes.filter((s) => s.active);
  const sizes = settings.sizes.filter((s) => s.active);

  function edit(update: (d: ConfigDraft) => ConfigDraft) {
    setDraft((d) => update(d));
    setDirty(true);
    setSaved('');
  }

  function toggleIn(field: 'flavorIds' | 'shapeIds', id: string, on: boolean) {
    edit((d) => {
      const next = new Set(d[field]);
      if (on) next.add(id);
      else next.delete(id);
      return { ...d, [field]: next };
    });
  }

  function setSize(sizeId: string, patch: Partial<{ checked: boolean; price: string }>) {
    edit((d) => ({
      ...d,
      sizes: { ...d.sizes, [sizeId]: { ...(d.sizes[sizeId] ?? { checked: false, price: '' }), ...patch } },
    }));
  }

  // Every other color (this design first, then the rest) as a copy source.
  const copySources = useMemo(() => {
    const ordered = [design, ...allDesigns.filter((d) => d.id !== design.id)];
    return ordered.flatMap((d) =>
      d.colors.filter((c) => c.id !== color.id).map((c) => ({ design: d, color: c }))
    );
  }, [allDesigns, design, color.id]);

  function applyCopy() {
    const source = copySources.find((s) => s.color.id === copyFrom);
    if (!source) return;
    edit(() => draftFrom(source.color));
    setCopyFrom('');
  }

  const checkedSizes = Object.entries(draft.sizes).filter(([, s]) => s.checked);
  const missingPrice = checkedSizes.some(([, s]) => !(Number(s.price) > 0));

  // Soft checklist: the color can be saved incomplete, but won't be bookable.
  const gaps = [
    checkedSizes.length === 0 && 'al menos un tamaño',
    ![...draft.flavorIds].some((id) => bizcochos.some((f) => f.id === id)) && `un ${w.bizcocho}`,
    ![...draft.flavorIds].some((id) => rellenos.some((f) => f.id === id)) && `un ${w.relleno}`,
    usesShapes && ![...draft.shapeIds].some((id) => shapes.some((s) => s.id === id)) && 'una forma',
  ].filter(Boolean) as string[];

  async function save() {
    if (missingPrice) return;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      await api.put(`/cake-designs/colors/${color.id}/config`, {
        flavorIds: [...draft.flavorIds],
        shapeIds: [...draft.shapeIds],
        sizePrices: Object.fromEntries(checkedSizes.map(([sizeId, s]) => [sizeId, Number(s.price)])),
      });
      setDirty(false);
      await onSaved();
      setSaved('Sabores, formas y tamaños guardados ✔');
    } catch (err) {
      setError(errorText(err, 'No se pudo guardar la configuración'));
    } finally {
      setSaving(false);
    }
  }

  const checkList = (
    items: { id: string; name: string }[],
    field: 'flavorIds' | 'shapeIds',
    emptyText: string
  ) =>
    items.length === 0 ? (
      <p className="edit-hint">{emptyText}</p>
    ) : (
      <div className="cs-check-grid">
        {items.map((item) => (
          <label key={item.id} className="cs-check">
            <input
              type="checkbox"
              checked={draft[field].has(item.id)}
              onChange={(e) => toggleIn(field, item.id, e.target.checked)}
            />
            {item.name}
          </label>
        ))}
      </div>
    );

  const noneActive = `No hay ninguno activo. Actívalos en "${boxes ? 'Tamaños, sabores y formas' : 'Sabores, tamaños y formas'}".`;

  return (
    <section className="form-section">
      <h2>3. Sabores, formas y tamaños de "{color.colorName}"</h2>

      {copySources.length > 0 && (
        <div className="cs-copy">
          <label className="admin-field-label">Copiar la configuración de otro {w.color}</label>
          <div className="cs-new-inline">
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Escoge un {w.color}…</option>
              {copySources.map(({ design: d, color: c }) => (
                <option key={c.id} value={c.id}>
                  {d.id === design.id ? c.colorName : `${d.name} · ${c.colorName}`}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-button" disabled={!copyFrom} onClick={applyCopy}>
              Copiar
            </button>
          </div>
          <p className="edit-hint">Llena todo con lo de ese {w.color}; revisa y guarda.</p>
        </div>
      )}

      <h3 className="cs-subtitle">{w.bizcochos}</h3>
      {checkList(bizcochos, 'flavorIds', noneActive)}

      <h3 className="cs-subtitle">{w.rellenos}</h3>
      {checkList(rellenos, 'flavorIds', noneActive)}

      {usesShapes && (
        <>
          <h3 className="cs-subtitle">Formas</h3>
          {checkList(shapes, 'shapeIds', noneActive)}
        </>
      )}

      <h3 className="cs-subtitle">
        {boxes ? 'Precio de la caja según el tamaño del alfajor' : 'Tamaños y precio de este color'}
      </h3>
      {sizes.length === 0 && <p className="edit-hint">{noneActive}</p>}
      {sizes.map((size) => {
        const s = draft.sizes[size.id] ?? { checked: false, price: '' };
        return (
          <div key={size.id} className="cs-size-price">
            <label className="cs-check">
              <input type="checkbox" checked={s.checked} onChange={(e) => setSize(size.id, { checked: e.target.checked })} />
              <span>
                {size.label}
                {!boxes && <span className="cs-meta">{size.prepMinutes} min</span>}
              </span>
            </label>
            <MoneyInput
              label={boxes ? `Precio de la caja con alfajores ${size.label.toLowerCase()}` : `Precio de ${size.label}`}
              value={s.checked ? s.price : ''}
              disabled={!s.checked}
              onChange={(v) => setSize(size.id, { price: v })}
            />
          </div>
        );
      })}

      {gaps.length > 0 && (
        <p className="edit-hint cs-gaps">
          Para que los clientes puedan pedir este {w.color} le falta: {gaps.join(', ')}.
        </p>
      )}
      {missingPrice && <p className="warning">Cada tamaño marcado necesita su precio.</p>}

      <div className="cs-notice">
        <strong>Aviso:</strong> revisa la información de este {w.color} 2 veces antes de guardarla para evitar
        equivocaciones.
      </div>
      {error && <p className="warning">{error}</p>}
      {saved && <p className="cs-saved">{saved}</p>}
      <button
        type="button"
        className="cta-button cs-full"
        disabled={saving || missingPrice || !dirty}
        onClick={save}
      >
        {saving ? 'Guardando...' : dirty ? 'Guardar sabores, formas y tamaños' : 'Sin cambios por guardar'}
      </button>
    </section>
  );
}
