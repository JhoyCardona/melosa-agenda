import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CartItem, ManagedOrderView } from '../types';

// The whole in-progress order: cart lines + delivery + customer fields. Lives in
// a context so it survives navigating catálogo <-> agendar (adding a second
// product means a round-trip through the catalog), and is mirrored to
// sessionStorage so a reload mid-flow doesn't wipe it.
//
// Two independent drafts live here: the normal booking one, and — while a client
// is changing an existing order from their private link ("modificar mi pedido")
// — an edit one preloaded from that order. Every page reads whichever is active,
// so the same catalog/configurator pages work for both, and an edit never
// clobbers a booking the client had half-built (or the other way round).

interface OrderDraft {
  items: CartItem[];
  deliveryDate: string;
  clientName: string;
  clientPhone: string;
}

// Who is editing which order: the credentials every /manage request repeats,
// plus the order as it was when opened (to show "antes → ahora").
export interface EditSession {
  token: string;
  phone: string;
  ticket: string;
  original: ManagedOrderView;
}

const EMPTY: OrderDraft = {
  items: [],
  deliveryDate: '',
  clientName: '',
  clientPhone: '',
};

const STORAGE_KEY = 'melosa_order_draft';
const EDIT_DRAFT_KEY = 'melosa_edit_draft';
const EDIT_SESSION_KEY = 'melosa_edit_session';

interface OrderDraftContextValue extends OrderDraft {
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  replaceItem: (key: string, item: CartItem) => void;
  patch: (fields: Partial<OrderDraft>) => void;
  reset: () => void;
  totalPrice: number;
  totalMinutes: number;
  edit: EditSession | null;
  startEdit: (session: EditSession, draft: OrderDraft) => void;
  endEdit: () => void;
}

const OrderDraftContext = createContext<OrderDraftContextValue | null>(null);

function loadJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / storage disabled — the context still works in-memory.
  }
}

function loadDraft(key: string): OrderDraft {
  const parsed = loadJson<Partial<OrderDraft>>(key);
  if (!parsed) return EMPTY;
  return {
    ...EMPTY,
    deliveryDate: parsed.deliveryDate ?? '',
    clientName: parsed.clientName ?? '',
    clientPhone: parsed.clientPhone ?? '',
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [booking, setBooking] = useState<OrderDraft>(() => loadDraft(STORAGE_KEY));
  const [editDraft, setEditDraft] = useState<OrderDraft>(() => loadDraft(EDIT_DRAFT_KEY));
  const [edit, setEdit] = useState<EditSession | null>(() => loadJson<EditSession>(EDIT_SESSION_KEY));

  useEffect(() => saveJson(STORAGE_KEY, booking), [booking]);
  useEffect(() => saveJson(EDIT_DRAFT_KEY, edit ? editDraft : null), [edit, editDraft]);
  useEffect(() => saveJson(EDIT_SESSION_KEY, edit), [edit]);

  const draft = edit ? editDraft : booking;
  const setDraft = edit ? setEditDraft : setBooking;

  const value: OrderDraftContextValue = {
    ...draft,
    addItem: (item) => setDraft((d) => ({ ...d, items: [...d.items, item] })),
    removeItem: (key) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== key) })),
    replaceItem: (key, item) =>
      setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? item : i)) })),
    patch: (fields) => setDraft((d) => ({ ...d, ...fields })),
    reset: () => {
      // Cleared right away, not via the effect above: checkout navigates to
      // WhatsApp right after reset(), before that effect gets to run, and a
      // client coming back would find the already-sent cart ready to resend.
      saveJson(edit ? EDIT_DRAFT_KEY : STORAGE_KEY, null);
      setDraft(EMPTY);
    },
    totalPrice: draft.items.reduce((sum, i) => sum + i.price, 0),
    totalMinutes: draft.items.reduce((sum, i) => sum + i.prepMinutes, 0),
    edit,
    startEdit: (session, initial) => {
      setEditDraft(initial);
      setEdit(session);
    },
    endEdit: () => {
      saveJson(EDIT_SESSION_KEY, null);
      saveJson(EDIT_DRAFT_KEY, null);
      setEdit(null);
      setEditDraft(EMPTY);
    },
  };

  return <OrderDraftContext.Provider value={value}>{children}</OrderDraftContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrderDraft() {
  const ctx = useContext(OrderDraftContext);
  if (!ctx) throw new Error('useOrderDraft debe usarse dentro de <OrderDraftProvider>');
  return ctx;
}
