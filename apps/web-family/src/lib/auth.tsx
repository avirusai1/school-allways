import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authSessionSchema, type AuthSession } from '@saw/shared-types';
import { apiFetch, ApiError, clearTokens, getAccessToken, setTokens } from './api';

type AuthContextValue = {
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  previewJoin: (token: string) => Promise<JoinResult>;
  activateJoin: (token: string, password: string) => Promise<JoinResult>;
  logout: () => Promise<void>;
};

export type JoinStudent = {
  id: string;
  name: string;
  className: string | null;
  sectionName: string | null;
  photoUrl: string | null;
  missingFields: Array<'address' | 'photo' | 'dateOfBirth' | 'bloodGroup'>;
};

export type JoinResult = {
  status: 'invalid' | 'expired' | 'already_activated' | 'pending' | 'joined';
  schoolName?: string;
  purpose?: 'parent_profile' | 'staff_invite' | 'student_invite';
  auth?: {
    accessToken: string;
    refreshToken: string;
    requiresTenantSelection?: boolean;
    tenants?: { id: string; name: string }[];
  };
  students?: JoinStudent[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<AuthSession | null> {
  if (!getAccessToken()) return null;
  const raw = await apiFetch<unknown>('/auth/session');
  return authSessionSchema.parse(raw);
}

async function persistAuth(auth: NonNullable<JoinResult['auth']>, qc: ReturnType<typeof useQueryClient>) {
  setTokens(auth.accessToken, auth.refreshToken);
  if (auth.requiresTenantSelection && auth.tenants?.[0]) {
    const selected = await apiFetch<{ accessToken: string }>('/auth/select-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenantId: auth.tenants[0].id }),
    });
    setTokens(selected.accessToken);
  }
  await qc.invalidateQueries({ queryKey: ['session'] });
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
        requiresTenantSelection?: boolean;
        tenants?: { id: string; name: string }[];
      }>('/auth/password/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (body.requiresTenantSelection && (!body.tenants || body.tenants.length === 0)) {
        throw new ApiError(
          403,
          'You have an invitation waiting — check your email for the join link from your school.',
          'INVITATION_PENDING',
        );
      }

      await persistAuth(body, qc);
    },
    [qc],
  );

  const previewJoin = useCallback(async (token: string): Promise<JoinResult> => {
    return apiFetch<JoinResult>(`/auth/join/${encodeURIComponent(token)}`, {
      method: 'POST',
    });
  }, []);

  const activateJoin = useCallback(
    async (token: string, password: string): Promise<JoinResult> => {
      const body = await apiFetch<JoinResult>(
        `/auth/join/${encodeURIComponent(token)}/activate`,
        { method: 'POST', body: JSON.stringify({ password }) },
      );
      if (body.status !== 'joined' || !body.auth) return body;
      await persistAuth(body.auth, qc);
      return body;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
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
      logout,
    }),
    [session, sessionQuery.isPending, loginWithPassword, previewJoin, activateJoin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
