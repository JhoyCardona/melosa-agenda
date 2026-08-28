import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import CatalogPage from './pages/CatalogPage';
import BookingPage from './pages/BookingPage';
import AdminLoginPage from './pages/AdminLoginPage';
import CatalogAdminPage from './pages/CatalogAdminPage';
import NewOrderPage from './pages/NewOrderPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/catalogo" element={<CatalogPage />} />
      {/* Always enter the customizer from the catalog, so the customer sees the
          design they're ordering. */}
      <Route path="/agendar" element={<Navigate to="/catalogo" replace />} />
      <Route path="/agendar/:designId" element={<BookingPage />} />
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route path="/admin/catalogo" element={<CatalogAdminPage />} />
      <Route path="/admin/pedidos/nuevo" element={<NewOrderPage />} />
    </Routes>
  );
}
