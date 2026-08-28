import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CartItem } from '../types';

// The whole in-progress order: cart lines + delivery + customer fields. Lives in
// a context so it survives navigating catálogo <-> agendar (adding a second
// product means a round-trip through the catalog), and is mirrored to
// sessionStorage so a reload mid-flow doesn't wipe it.

interface OrderDraft {
  items: CartItem[];
  deliveryDate: string;
  clientName: string;
  clientPhone: string;
  notes: string;
}

const EMPTY: OrderDraft = {
  items: [],
  deliveryDate: '',
  clientName: '',
  clientPhone: '',
  notes: '',
};

const STORAGE_KEY = 'melosa_order_draft';

interface OrderDraftContextValue extends OrderDraft {
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  patch: (fields: Partial<OrderDraft>) => void;
  reset: () => void;
  totalPrice: number;
  totalMinutes: number;
}

const OrderDraftContext = createContext<OrderDraftContextValue | null>(null);

function loadDraft(): OrderDraft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<OrderDraft>;
    return { ...EMPTY, ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return EMPTY;
  }
}

export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OrderDraft>(loadDraft);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Private mode / storage disabled — the context still works in-memory.
    }
  }, [draft]);

  const value: OrderDraftContextValue = {
    ...draft,
    addItem: (item) => setDraft((d) => ({ ...d, items: [...d.items, item] })),
    removeItem: (key) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== key) })),
    patch: (fields) => setDraft((d) => ({ ...d, ...fields })),
    reset: () => setDraft(EMPTY),
    totalPrice: draft.items.reduce((sum, i) => sum + i.price, 0),
    totalMinutes: draft.items.reduce((sum, i) => sum + i.prepMinutes, 0),
  };

  return <OrderDraftContext.Provider value={value}>{children}</OrderDraftContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrderDraft() {
  const ctx = useContext(OrderDraftContext);
  if (!ctx) throw new Error('useOrderDraft debe usarse dentro de <OrderDraftProvider>');
  return ctx;
}
