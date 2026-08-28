import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { OrderDraftProvider } from './context/OrderDraft'
import { AdminAuthProvider } from './context/AdminAuth'
import AdminBar from './components/AdminBar'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/melosa-agenda">
      <AdminAuthProvider>
        <OrderDraftProvider>
          <AdminBar />
          <App />
        </OrderDraftProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
