import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// The axios interceptor (src/api.ts) reads this same key, so keeping it here
// means one place manages the admin session.
const TOKEN_KEY = 'melosa_admin_token';
const ISSUED_KEY = 'melosa_admin_issued_at';

// The JWT itself lives 30 days (shared with the mobile app, used daily). The web
// forces a re-login sooner: a session left open on a borrowed computer shouldn't
// stay valid for a month.
const WEB_SESSION_MS = 3 * 24 * 60 * 60 * 1000;

interface AdminAuthValue {
  isAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

function readValidToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const issued = Number(localStorage.getItem(ISSUED_KEY) ?? 0);
    if (!issued || Date.now() - issued > WEB_SESSION_MS) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ISSUED_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readValidToken());

  // The tab may sit open for days — re-check the 3-day window when it refocuses.
  useEffect(() => {
    const check = () => {
      if (!readValidToken()) setToken(null);
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  const login = useCallback((newToken: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(ISSUED_KEY, String(Date.now()));
    } catch {
      // storage disabled — session works in-memory for this tab only
    }
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ISSUED_KEY);
    } catch {
      // ignore
    }
    setToken(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAdmin: !!token, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de <AdminAuthProvider>');
  return ctx;
}
