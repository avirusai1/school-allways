import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authSessionSchema, type AuthSession } from '@saw/shared-types';
import { apiFetch, clearTokens, getAccessToken, setTokens } from './api';

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  previewJoin: (token: string) => Promise<JoinResult>;
  activateJoin: (token: string, password: string) => Promise<JoinResult>;
  handoffWithCode: (code: string) => Promise<JoinResult>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

export type JoinResult = {
  status: 'invalid' | 'expired' | 'already_activated' | 'pending' | 'joined';
  schoolName?: string;
  purpose?: 'parent_profile' | 'staff_invite' | 'student_invite' | 'signup_handoff';
  auth?: {
    accessToken: string;
    refreshToken: string;
    requiresTenantSelection?: boolean;
    tenants?: { id: string; name: string }[];
  };
  staff?: {
    id: string;
    name: string;
    designation: string | null;
    department: string | null;
  };
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<AuthSession | null> {
  if (!getAccessToken()) return null;
  const raw = await apiFetch<unknown>('/auth/session');
  return authSessionSchema.parse(raw);
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

  /**
   * Redeems a one-time code for a session. Signup handoff uses this; staff
   * invites go through preview + activate so the person sets a password first.
   */
  const redeem = useCallback(
    async (path: string, body?: unknown): Promise<JoinResult> => {
      const res = await apiFetch<JoinResult>(path, {
        method: 'POST',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (res.status !== 'joined' || !res.auth) return res;

      setTokens(res.auth.accessToken, res.auth.refreshToken);
      if (res.auth.requiresTenantSelection && res.auth.tenants?.[0]) {
        const selected = await apiFetch<{ accessToken: string }>('/auth/select-tenant', {
          method: 'POST',
          body: JSON.stringify({ tenantId: res.auth.tenants[0].id }),
        });
        setTokens(selected.accessToken);
      }
      await qc.invalidateQueries({ queryKey: ['session'] });
      return res;
    },
    [qc],
  );

  const previewJoin = useCallback(
    (token: string) =>
      apiFetch<JoinResult>(`/auth/join/${encodeURIComponent(token)}`, { method: 'POST' }),
    [],
  );

  const activateJoin = useCallback(
    (token: string, password: string) =>
      redeem(`/auth/join/${encodeURIComponent(token)}/activate`, { password }),
    [redeem],
  );

  /** Arrival from the public signup form on the marketing site. */
  const handoffWithCode = useCallback(
    (code: string) => redeem(`/auth/handoff/${encodeURIComponent(code)}`),
    [redeem],
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
      previewJoin,
      activateJoin,
      handoffWithCode,
      logout,
      hasPermission: (code) => Boolean(session?.permissions.includes(code)),
    }),
    [
      session,
      sessionQuery.isPending,
      loginWithPassword,
      previewJoin,
      activateJoin,
      handoffWithCode,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
