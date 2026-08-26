import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import BookingPage from './pages/BookingPage';
import AdminLoginPage from './pages/AdminLoginPage';
import CatalogAdminPage from './pages/CatalogAdminPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agendar" element={<BookingPage />} />
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route path="/admin/catalogo" element={<CatalogAdminPage />} />
    </Routes>
  );
}
