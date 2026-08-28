import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { OrderDraftProvider } from './context/OrderDraft'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/melosa-agenda">
      <OrderDraftProvider>
        <App />
      </OrderDraftProvider>
    </BrowserRouter>
  </StrictMode>,
)
