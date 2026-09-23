import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAdminAuth } from '../context/AdminAuth';
import PasswordPrompt from '../components/PasswordPrompt';
import type {
  CakeFlavorSetting,
  CakeSettings,
  CakeShapeSetting,
  CakeSizeSetting,
  FlavorKind,
} from '../types';
import './adminLegacy.css';
import './cakeSettings.css';

// "Sabores, tamaños y formas" (catalog v2): the global lists every cake design
// picks from. Structural actions (add, rename, activate, delete) save right
// away; the per-size flavor surcharges are edited as a grid and saved together
// with the bottom button, since gretica fills many of them at once.

type SurchargeDrafts = Record<string, Record<string, string>>; // flavorId → sizeId → digits

function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

// Digits-only money handling: the input shows "12.500" but state keeps "12500",
// so a typed thousands separator can never be read as a decimal point.
function onlyDigits(v: string): string {
  return v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

function formatPesos(digits: string): string {
  return digits === '' ? '' : Number(digits).toLocaleString('es-CO');
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="cs-money">
      <span aria-hidden="true">$</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={formatPesos(value)}
        placeholder="0"
        onChange={(e) => onChange(onlyDigits(e.target.value))}
      />
    </span>
  );
}

function usageNote(count: number): string {
  if (count === 0) return 'No está en ningún diseño todavía.';
  return `Está en ${count === 1 ? '1 color' : `${count} colores`} de diseños; se quitará de todos.`;
}

export default function CakeSettingsPage() {
  const navigate = useNavigate();
  const { isAdmin, logout } = useAdminAuth();

  const [settings, setSettings] = useState<CakeSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<SurchargeDrafts>({});
  const [savedMessage, setSavedMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ message: string; path: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<CakeSettings>('/cake-settings');
      setSettings(res.data);
      setLoadError('');
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        logout();
        navigate('/admin', { replace: true });
        return;
      }
      setLoadError(errorText(err, 'No se pudieron cargar los sabores, tamaños y formas'));
    }
  }, [logout, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    load();
  }, [isAdmin, navigate, load]);

  // Runs one write, then reloads the lists. One request at a time (busy) so a
  // double tap can't create the same size twice.
  async function run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setBusy(true);
    setActionError('');
    setSavedMessage('');
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      setActionError(errorText(err, fallback));
      // Re-sync with the server so an optimistic change that failed is undone.
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Checkbox flips instantly (optimistic) — waiting a Render round-trip before
  // the tick shows felt broken on a phone. `run` reloads from the server
  // afterwards, which also reverts the box if the save failed.
  function toggleActive(list: 'sizes' | 'shapes' | 'bizcochos' | 'rellenos', id: string, active: boolean) {
    const path = list === 'sizes' ? 'sizes' : list === 'shapes' ? 'shapes' : 'flavors';
    setSettings((prev) =>
      prev ? { ...prev, [list]: prev[list].map((row) => (row.id === id ? { ...row, active } : row)) } : prev
    );
    run(() => api.patch(`/cake-settings/${path}/${id}`, { active }), 'No se pudo activar/desactivar');
  }

  // ─── Surcharge drafts ───

  const allFlavors = useMemo(
    () => (settings ? [...settings.bizcochos, ...settings.rellenos] : []),
    [settings]
  );

  function draftValue(flavor: CakeFlavorSetting, sizeId: string): string {
    const draft = drafts[flavor.id]?.[sizeId];
    if (draft !== undefined) return draft;
    const saved = flavor.surcharges[sizeId];
    return saved ? String(saved) : '';
  }

  function setDraft(flavorId: string, sizeId: string, value: string) {
    setSavedMessage('');
    setDrafts((prev) => ({ ...prev, [flavorId]: { ...prev[flavorId], [sizeId]: value } }));
  }

  // Only the cells that actually differ from what's saved, and only for
  // flavors/sizes that still exist (one may have been deleted meanwhile).
  const changedSurcharges = useMemo(() => {
    if (!settings) return [];
    const sizeIds = new Set(settings.sizes.map((s) => s.id));
    return allFlavors
      .map((flavor) => {
        const changes: Record<string, number> = {};
        for (const [sizeId, digits] of Object.entries(drafts[flavor.id] ?? {})) {
          if (!sizeIds.has(sizeId)) continue;
          const amount = digits === '' ? 0 : Number(digits);
          if (amount !== (flavor.surcharges[sizeId] ?? 0)) changes[sizeId] = amount;
        }
        return { flavor, changes };
      })
      .filter(({ changes }) => Object.keys(changes).length > 0);
  }, [allFlavors, drafts, settings]);

  const hasUnsaved = changedSurcharges.length > 0;

  // Closing the tab with unsaved surcharges asks first.
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  async function saveSurcharges() {
    const ok = await run(async () => {
      for (const { flavor, changes } of changedSurcharges) {
        await api.patch(`/cake-settings/flavors/${flavor.id}`, { surcharges: changes });
      }
    }, 'No se pudieron guardar los precios de los sabores');
    if (ok) {
      setDrafts({});
      setSavedMessage('Precios de sabores guardados ✔');
    }
  }

  // ─── Delete (password-gated) ───

  function askDelete(message: string, path: string) {
    setActionError('');
    setPendingDelete({ message, path });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { path } = pendingDelete;
    setPendingDelete(null);
    await run(() => api.delete(path), 'No se pudo eliminar');
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

  if (!settings) {
    return (
      <div className="admin-page">
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="admin-page cs-page">
      <Link to="/admin/tortas" className="admin-back">
        ← Atrás
      </Link>
      <h1>Sabores, tamaños y formas</h1>
      <p className="edit-hint">
        Todo lo de esta página es global: aplica para todas las tortas. Lo que crees aquí nace
        <strong> desactivado</strong>; márcalo como activo cuando esté listo, y después cada diseño
        escoge cuáles permite.
      </p>

      {actionError && <p className="warning cs-banner">{actionError}</p>}

      {/* ─── 1. Sizes ─── */}
      <section className="form-section">
        <h2>1. Tamaños</h2>
        <p className="edit-hint">Se ordenan solos por número de porciones.</p>
        {settings.sizes.length === 0 && <p className="muted">Todavía no hay tamaños.</p>}
        {settings.sizes.map((size) => (
          <SizeRow
            key={size.id}
            size={size}
            busy={busy}
            onToggle={(active) => toggleActive('sizes', size.id, active)}
            onSave={(changes) =>
              run(() => api.patch(`/cake-settings/sizes/${size.id}`, changes), 'No se pudo editar el tamaño')
            }
            onDelete={() =>
              askDelete(
                `¿Eliminar el tamaño "${size.label}"? ${usageNote(size.usedByColors)}`,
                `/cake-settings/sizes/${size.id}`
              )
            }
          />
        ))}
        <NewSizeForm
          busy={busy}
          onCreate={(data) => run(() => api.post('/cake-settings/sizes', data), 'No se pudo crear el tamaño')}
        />
      </section>

      {/* ─── 2. Shapes ─── */}
      <section className="form-section">
        <h2>2. Formas</h2>
        {settings.shapes.length === 0 && <p className="muted">Todavía no hay formas.</p>}
        {settings.shapes.map((shape) => (
          <NameRow
            key={shape.id}
            item={shape}
            busy={busy}
            onToggle={(active) => toggleActive('shapes', shape.id, active)}
            onRename={(name) =>
              run(() => api.patch(`/cake-settings/shapes/${shape.id}`, { name }), 'No se pudo editar la forma')
            }
            onDelete={() =>
              askDelete(
                `¿Eliminar la forma "${shape.name}"? ${usageNote(shape.usedByColors)}`,
                `/cake-settings/shapes/${shape.id}`
              )
            }
          />
        ))}
        <NewNameForm
          placeholder="Nombre de la nueva forma"
          buttonText="Agregar forma"
          busy={busy}
          onCreate={(name) => run(() => api.post('/cake-settings/shapes', { name }), 'No se pudo crear la forma')}
        />
      </section>

      {/* ─── 3 & 4. Flavors ─── */}
      {(
        [
          ['BIZCOCHO', '3. Sabores de bizcocho', settings.bizcochos],
          ['RELLENO', '4. Sabores de relleno', settings.rellenos],
        ] as [FlavorKind, string, CakeFlavorSetting[]][]
      ).map(([kind, title, flavors]) => (
        <section className="form-section" key={kind}>
          <h2>{title}</h2>
          <p className="edit-hint">
            El valor de cada tamaño es lo que se <strong>suma</strong> al precio de la torta cuando el
            cliente escoge ese sabor. Déjalo vacío si no cuesta más.
          </p>
          {flavors.length === 0 && <p className="muted">Todavía no hay sabores.</p>}
          {flavors.map((flavor) => (
            <div className="cs-flavor" key={flavor.id}>
              <NameRow
                item={flavor}
                busy={busy}
                onToggle={(active) =>
                  toggleActive(kind === 'BIZCOCHO' ? 'bizcochos' : 'rellenos', flavor.id, active)
                }
                onRename={(name) =>
                  run(() => api.patch(`/cake-settings/flavors/${flavor.id}`, { name }), 'No se pudo editar el sabor')
                }
                onDelete={() =>
                  askDelete(
                    `¿Eliminar el sabor "${flavor.name}"? ${usageNote(flavor.usedByColors)}`,
                    `/cake-settings/flavors/${flavor.id}`
                  )
                }
              />
              {settings.sizes.length === 0 ? (
                <p className="edit-hint">Crea primero los tamaños para ponerle precio a este sabor.</p>
              ) : (
                <div className="cs-surcharge-grid">
                  {settings.sizes.map((size) => (
                    <label key={size.id} className={size.active ? '' : 'is-inactive'}>
                      <span>{size.label}</span>
                      <MoneyInput
                        label={`Recargo de ${flavor.name} en ${size.label}`}
                        value={draftValue(flavor, size.id)}
                        onChange={(v) => setDraft(flavor.id, size.id, v)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <NewNameForm
            placeholder={`Nombre del nuevo sabor de ${kind === 'BIZCOCHO' ? 'bizcocho' : 'relleno'}`}
            buttonText={`Agregar sabor de ${kind === 'BIZCOCHO' ? 'bizcocho' : 'relleno'}`}
            busy={busy}
            onCreate={(name) =>
              run(() => api.post('/cake-settings/flavors', { name, kind }), 'No se pudo crear el sabor')
            }
          />
        </section>
      ))}

      <div className="cs-save-bar">
        <p className="cs-save-note">
          <strong>Aviso:</strong> los sabores que agregues aquí son globales; saldrán en todas las tortas
          que los permitan.
        </p>
        {savedMessage && <p className="cs-saved">{savedMessage}</p>}
        <button
          type="button"
          className="cta-button"
          disabled={!hasUnsaved || busy}
          onClick={saveSurcharges}
        >
          {busy ? 'Guardando...' : hasUnsaved ? 'Guardar precios de sabores' : 'Sin cambios por guardar'}
        </button>
      </div>

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

// ─── Sizes ───

interface SizeFields {
  label: string;
  portions: number;
  prepMinutes: number;
  requiresFullPayment: boolean;
}

// Shared inputs for creating and editing a size. Portions and minutes are kept
// as digit strings while typing and only turned into numbers on submit.
function SizeFieldsForm({
  initial,
  submitText,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: { label: string; portions: string; prepMinutes: string; requiresFullPayment: boolean };
  submitText: string;
  busy: boolean;
  onSubmit: (fields: SizeFields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [portions, setPortions] = useState(initial.portions);
  const [prepMinutes, setPrepMinutes] = useState(initial.prepMinutes);
  const [requiresFullPayment, setRequiresFullPayment] = useState(initial.requiresFullPayment);

  const valid = label.trim() !== '' && Number(portions) > 0 && Number(prepMinutes) > 0;

  async function submit() {
    if (!valid) return;
    const ok = await onSubmit({
      label: label.trim(),
      portions: Number(portions),
      prepMinutes: Number(prepMinutes),
      requiresFullPayment,
    });
    if (ok && !onCancel) {
      setLabel('');
      setPortions('');
      setPrepMinutes('');
      setRequiresFullPayment(false);
    }
  }

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
            placeholder="Ej: 30"
            onChange={(e) => setPrepMinutes(onlyDigits(e.target.value))}
          />
        </div>
      </div>
      <label className="cs-check">
        <input
          type="checkbox"
          checked={requiresFullPayment}
          onChange={(e) => setRequiresFullPayment(e.target.checked)}
        />
        Pago del 100% cuando es lo único del pedido (si piden 2 o más tortas, es el 50%)
      </label>
      <div className="cs-actions">
        {onCancel && (
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
        <button type="button" className="secondary-button cs-primary" onClick={submit} disabled={!valid || busy}>
          {submitText}
        </button>
      </div>
    </div>
  );
}

function SizeRow({
  size,
  busy,
  onToggle,
  onSave,
  onDelete,
}: {
  size: CakeSizeSetting;
  busy: boolean;
  onToggle: (active: boolean) => void;
  onSave: (fields: SizeFields) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="cs-row is-editing">
        <SizeFieldsForm
          initial={{
            label: size.label,
            portions: String(size.portions),
            prepMinutes: String(size.prepMinutes),
            requiresFullPayment: size.requiresFullPayment,
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
    <div className={`cs-row${size.active ? '' : ' is-inactive'}`}>
      <label className="cs-check cs-row-main">
        <input type="checkbox" checked={size.active} disabled={busy} onChange={(e) => onToggle(e.target.checked)} />
        <span>
          <strong>{size.label}</strong>
          <span className="cs-meta">
            {size.portions} porciones · {size.prepMinutes} min
            {size.requiresFullPayment && ' · pago 100% si va sola'}
            {!size.active && ' · desactivado'}
          </span>
        </span>
      </label>
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
        initial={{ label: '', portions: '', prepMinutes: '', requiresFullPayment: false }}
        submitText="Crear tamaño"
        busy={busy}
        onSubmit={async (fields) => {
          const ok = await onCreate(fields);
          if (ok) setOpen(false);
          return ok;
        }}
      />
      <button type="button" className="link-button" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </div>
  );
}

// ─── Name-only rows (shapes and flavors) ───

function NameRow({
  item,
  busy,
  onToggle,
  onRename,
  onDelete,
}: {
  item: CakeShapeSetting | CakeFlavorSetting;
  busy: boolean;
  onToggle: (active: boolean) => void;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);

  if (editing) {
    return (
      <div className="cs-row is-editing">
        <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        <div className="cs-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setName(item.name);
              setEditing(false);
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="secondary-button cs-primary"
            disabled={busy || name.trim() === ''}
            onClick={async () => {
              if (await onRename(name.trim())) setEditing(false);
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`cs-row${item.active ? '' : ' is-inactive'}`}>
      <label className="cs-check cs-row-main">
        <input type="checkbox" checked={item.active} disabled={busy} onChange={(e) => onToggle(e.target.checked)} />
        <span>
          <strong>{item.name}</strong>
          {!item.active && <span className="cs-meta">desactivado</span>}
        </span>
      </label>
      <span className="cs-row-buttons">
        <button
          type="button"
          className="link-button"
          disabled={busy}
          onClick={() => {
            setName(item.name);
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

function NewNameForm({
  placeholder,
  buttonText,
  busy,
  onCreate,
}: {
  placeholder: string;
  buttonText: string;
  busy: boolean;
  onCreate: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');

  async function submit() {
    if (name.trim() === '') return;
    if (await onCreate(name.trim())) setName('');
  }

  return (
    <div className="cs-new cs-new-inline">
      <input
        type="text"
        value={name}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" className="secondary-button cs-primary" disabled={busy || name.trim() === ''} onClick={submit}>
        {buttonText}
      </button>
    </div>
  );
}
