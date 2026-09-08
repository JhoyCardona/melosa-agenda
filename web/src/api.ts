import axios, { type AxiosRequestConfig } from 'axios';

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

// Render's free tier spins the backend down after ~15 min idle; the first request
// then cold-boots for 30-60s (and can 502 mid-boot). A keep-alive cron pings it,
// but that can miss — so the public read endpoints retry with a delay instead of
// failing on the first buyer of the day. Each attempt gets a generous timeout so
// we don't kill a request that's just waiting on the boot.
export async function getWithRetry<T>(
  url: string,
  opts: { retries?: number; delayMs?: number; onSlow?: () => void; config?: AxiosRequestConfig } = {}
): Promise<T> {
  const { retries = 2, delayMs = 2500, onSlow, config } = opts;
  const slowTimer = onSlow ? window.setTimeout(onSlow, 4000) : undefined;
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await api.get<T>(url, { timeout: 45000, ...config });
        return res.data;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await new Promise((r) => window.setTimeout(r, delayMs));
      }
    }
    throw lastError;
  } finally {
    if (slowTimer !== undefined) window.clearTimeout(slowTimer);
  }
}

export default api;
