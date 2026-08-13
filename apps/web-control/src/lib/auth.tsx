import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformSessionSchema, type PlatformSession } from '@saw/shared-types';
import { apiFetch, clearTokens, getAccessToken, setTokens } from './api';

type AuthContextValue = {
  session: PlatformSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Not `/auth/session` — that one requires a selected school and 401s for a
 * platform admin, who by definition has none.
 */
async function fetchSession(): Promise<PlatformSession | null> {
  if (!getAccessToken()) return null;
  const raw = await apiFetch<unknown>('/auth/platform-session');
  return platformSessionSchema.parse(raw);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const body = await apiFetch<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/password/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(body.accessToken, body.refreshToken);
      await qc.invalidateQueries({ queryKey: ['session'] });
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      /* still clear local */
    }
    clearTokens();
    qc.setQueryData(['session'], null);
  }, [qc]);

  const session = sessionQuery.data ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading: sessionQuery.isPending,
      isAuthenticated: Boolean(session),
      loginWithPassword,
      logout,
      hasPermission: (code) => Boolean(session?.permissions.includes(code)),
    }),
    [session, sessionQuery.isPending, loginWithPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
