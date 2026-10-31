import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import BookingPage from './pages/BookingPage';
import CakeBookingPage from './pages/CakeBookingPage';
import CartPage from './pages/CartPage';
import AlfajorRedirect from './pages/AlfajorRedirect';
import ManageOrderPage from './pages/ManageOrderPage';
import AdminLoginPage from './pages/AdminLoginPage';
import CatalogAdminPage from './pages/CatalogAdminPage';
import NewOrderPage from './pages/NewOrderPage';
import AdminPanelPage from './pages/AdminPanelPage';
import CakeModulePage from './pages/CakeModulePage';
import CakeSettingsPage from './pages/CakeSettingsPage';
import CakeDesignsPage from './pages/CakeDesignsPage';
import AlfajorModulePage from './pages/AlfajorModulePage';
import AlfajorCakePage from './pages/AlfajorCakePage';
import AlfajorCakeModulePage from './pages/AlfajorCakeModulePage';
import ScrollToTop from './components/ScrollToTop';

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Old test address of the redesigned home, in case someone kept it. */}
        <Route path="/nuevo" element={<Navigate to="/" replace />} />
        {/* `key` so switching between the two catalogs remounts (fresh state). */}
        <Route path="/catalogo" element={<CatalogPage key="CAKE" />} />
        <Route path="/catalogo-alfajor" element={<CatalogPage key="ALFAJOR_CAKE" category="ALFAJOR_CAKE" />} />
        {/* Always enter the customizer from the catalog, so the customer sees the
            design they're ordering. */}
        <Route path="/agendar" element={<Navigate to="/catalogo" replace />} />
        <Route path="/agendar/:designId" element={<BookingPage />} />
        <Route path="/tortas/:designId" element={<CakeBookingPage />} />
        <Route path="/tu-pedido" element={<CartPage />} />
        <Route path="/alfajor" element={<AlfajorRedirect />} />
        {/* Private link from the client's WhatsApp message. */}
        <Route path="/mi-pedido/:token" element={<ManageOrderPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/catalogo" element={<CatalogAdminPage />} />
        <Route path="/admin/pedidos/nuevo" element={<NewOrderPage />} />
        <Route path="/admin/panel" element={<AdminPanelPage />} />
        <Route path="/admin/tortas" element={<CakeModulePage />} />
        <Route path="/admin/tortas/sabores-tamanos" element={<CakeSettingsPage key="CAKE" />} />
        <Route path="/admin/tortas/disenos" element={<CakeDesignsPage key="CAKE" />} />
        <Route path="/admin/alfajores" element={<AlfajorModulePage />} />
        <Route path="/admin/alfajores/torta" element={<AlfajorCakeModulePage />} />
        <Route
          path="/admin/alfajores/torta/sabores-tamanos"
          element={<CakeSettingsPage key="ALFAJOR_CAKE" category="ALFAJOR_CAKE" />}
        />
        <Route
          path="/admin/alfajores/torta/disenos"
          element={<CakeDesignsPage key="ALFAJOR_CAKE" category="ALFAJOR_CAKE" />}
        />
        <Route path="/admin/alfajores/torta/anterior" element={<AlfajorCakePage />} />
      </Routes>
    </>
  );
}
