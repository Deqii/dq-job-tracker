import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { api, clearStoredAuth, getStoredAuth, storeAuth } from '../lib/api';
import { AuthContext } from './auth-context';
import type { AuthContextValue } from './auth-context';
import type { AuthResponse, User } from '../types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredAuth().user);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/api/auth/login', { email, password });
    storeAuth(data);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/api/auth/register', { email, password });
    storeAuth(data);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  const status: AuthContextValue['status'] = user ? 'authenticated' : 'unauthenticated';

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}