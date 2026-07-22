import { createContext, useContext, useState, ReactNode } from 'react';
import { ClientData, DraftOrderItem } from '../types/order';

interface NewOrderContextType {
  clientData: ClientData;
  setClientData: (data: ClientData) => void;
  items: DraftOrderItem[];
  addItem: (item: DraftOrderItem) => void;
  resetOrder: () => void;
}

const emptyClientData: ClientData = {
  clientName: '',
  clientPhone: '',
  deliveryDate: '',
  deliveryAddress: '',
};

const NewOrderContext = createContext<NewOrderContextType | undefined>(undefined);

export function NewOrderProvider({ children }: { children: ReactNode }) {
  const [clientData, setClientData] = useState<ClientData>(emptyClientData);
  const [items, setItems] = useState<DraftOrderItem[]>([]);

  function addItem(item: DraftOrderItem) {
    setItems((prev) => [...prev, item]);
  }

  function resetOrder() {
    setClientData(emptyClientData);
    setItems([]);
  }

  return (
    <NewOrderContext.Provider value={{ clientData, setClientData, items, addItem, resetOrder }}>
      {children}
    </NewOrderContext.Provider>
  );
}

export function useNewOrder() {
  const context = useContext(NewOrderContext);
  if (!context) {
    throw new Error('useNewOrder debe usarse dentro de NewOrderProvider');
  }
  return context;
}