import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  apiLogin,
  apiRegister,
  apiLogout,
  apiGetMe,
  getTokens,
  clearTokens,
  decodeToken,
  isTokenExpired,
} from '../lib/api';

const AuthContext = createContext(null);

/** Map an /api/users/me response onto the context user shape. */
function profileFromMe(me) {
  return {
    id: me.id,
    email: me.email,
    display_name: me.display_name,
    preferred_units: me.preferred_units,
    notifications_enabled: me.notifications_enabled,
    created_at: me.created_at,
    onboarding_completed: me.onboarding_completed,
    fitness_goal: me.fitness_goal ?? null,
    fitness_level: me.fitness_level ?? null,
    preferred_equipment: me.preferred_equipment ?? null,
    days_per_week: me.days_per_week ?? null,
    preferred_days: me.preferred_days ?? [],
    gender: me.gender ?? 'male',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Derive user id from stored token on mount, then fetch full profile.
  useEffect(() => {
    const { access, refresh } = getTokens();
    if (access && !isTokenExpired(access)) {
      // Happy path — access token still valid.
      const payload = decodeToken(access);
      setUser({ id: payload.sub });
      apiGetMe()
        .then(me => setUser(profileFromMe(me)))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else if (refresh) {
      // Access token expired but refresh token present — apiFetch will silently
      // renew the access token before the request goes out.
      apiGetMe()
        .then(me => setUser(profileFromMe(me)))
        .catch(() => clearTokens())
        .finally(() => setLoading(false));
    } else {
      clearTokens();
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiGetMe();
      setUser(profileFromMe(me));
    } catch {}
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    const payload = decodeToken(data.access_token);
    setUser({ id: payload.sub });
    apiGetMe()
      .then(me => setUser(profileFromMe(me)))
      .catch(() => {});
    return data;
  }, []);

  const register = useCallback(async (email, displayName, password, passwordConfirm) => {
    const data = await apiRegister(email, displayName, password, passwordConfirm);
    const payload = decodeToken(data.access_token);
    setUser({ id: payload.sub });
    apiGetMe()
      .then(me => setUser(profileFromMe(me)))
      .catch(() => {});
    return data;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
