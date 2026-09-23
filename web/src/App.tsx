import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import CatalogPage from './pages/CatalogPage';
import BookingPage from './pages/BookingPage';
import CakeBookingPage from './pages/CakeBookingPage';
import AdminLoginPage from './pages/AdminLoginPage';
import CatalogAdminPage from './pages/CatalogAdminPage';
import NewOrderPage from './pages/NewOrderPage';
import AdminPanelPage from './pages/AdminPanelPage';
import CakeModulePage from './pages/CakeModulePage';
import CakeSettingsPage from './pages/CakeSettingsPage';
import CakeDesignsPage from './pages/CakeDesignsPage';
import ScrollToTop from './components/ScrollToTop';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        {/* Always enter the customizer from the catalog, so the customer sees the
            design they're ordering. */}
        <Route path="/agendar" element={<Navigate to="/catalogo" replace />} />
        <Route path="/agendar/:designId" element={<BookingPage />} />
        <Route path="/tortas/:designId" element={<CakeBookingPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/catalogo" element={<CatalogAdminPage />} />
        <Route path="/admin/pedidos/nuevo" element={<NewOrderPage />} />
        <Route path="/admin/panel" element={<AdminPanelPage />} />
        <Route path="/admin/tortas" element={<CakeModulePage />} />
        <Route path="/admin/tortas/sabores-tamanos" element={<CakeSettingsPage />} />
        <Route path="/admin/tortas/disenos" element={<CakeDesignsPage />} />
      </Routes>
    </>
  );
}
