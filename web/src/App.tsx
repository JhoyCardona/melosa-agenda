import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import BookingPage from './pages/BookingPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agendar" element={<BookingPage />} />
    </Routes>
  );
}
