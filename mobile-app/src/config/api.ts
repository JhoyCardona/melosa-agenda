import axios from 'axios';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://melosa-agenda-backend.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
  // Render's free tier cold-boots for 30-60s; without a ceiling a bad connection
  // just spins forever. Long enough to survive a cold start, short enough to fail.
  timeout: 45000,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// The JWT lasts 30 days. When it expires (or is revoked) every screen would
// otherwise just show its empty state forever with no way back to the login
// screen. On any 401 that isn't the login call itself: wipe the token and bounce
// to /login. Guarded so a burst of parallel 401s only redirects once.
let handlingExpiredSession = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    const isLoginCall = url.includes('/auth/login');

    if (status === 401 && !isLoginCall && !handlingExpiredSession) {
      handlingExpiredSession = true;
      try {
        await SecureStore.deleteItemAsync('authToken');
      } catch {
        // ignore — we're logging out anyway
      }
      Alert.alert('Tu sesión expiró', 'Ingresá de nuevo con la contraseña.');
      router.replace('/login');
      // Let it reset shortly after so a later real 401 still redirects.
      setTimeout(() => {
        handlingExpiredSession = false;
      }, 2000);
    }

    return Promise.reject(error);
  }
);

export default api;
