import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://melosa-agenda-backend.onrender.com/api';

const api = axios.create({ baseURL: API_URL });

// Same auth pattern as the mobile app: attach the stored JWT to every request if
// present. Public endpoints (booking, catalog) simply ignore the header.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('melosa_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
