import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://melosa-agenda-backend.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;