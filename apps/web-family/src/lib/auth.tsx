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
  requestOtp: (phone: string) => Promise<{ expiresInSeconds: number; devOtp?: string }>;
  verifyOtp: (phone: string, otp: string, tenantId?: string) => Promise<void>;
  joinWithToken: (token: string) => Promise<JoinResult>;
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
  status: 'invalid' | 'expired' | 'already_activated' | 'joined';
  schoolName?: string;
  purpose?: 'parent_profile' | 'staff_invite';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: fetchSession,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const requestOtp = useCallback(async (phone: string) => {
    return apiFetch<{ expiresInSeconds: number; devOtp?: string }>('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone, purpose: 'login' }),
    });
  }, []);

  const verifyOtp = useCallback(
    async (phone: string, otp: string, tenantId?: string) => {
      const body = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        requiresTenantSelection?: boolean;
        tenants?: { id: string; name: string }[];
      }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, purpose: 'login', code: otp }),
      });

      // Backend should refuse invited-only accounts before issuing tokens.
      // Keep this guard so an empty tenant list never looks like a successful login.
      if (body.requiresTenantSelection && (!body.tenants || body.tenants.length === 0)) {
        throw new ApiError(
          403,
          'You have an invitation waiting — check your SMS or WhatsApp for the join link from your school.',
          'INVITATION_PENDING',
        );
      }

      setTokens(body.accessToken, body.refreshToken);
      if (body.requiresTenantSelection && body.tenants?.[0] && !tenantId) {
        const selected = await apiFetch<{ accessToken: string }>('/auth/select-tenant', {
          method: 'POST',
          body: JSON.stringify({ tenantId: body.tenants[0].id }),
        });
        setTokens(selected.accessToken);
      }
      await qc.invalidateQueries({ queryKey: ['session'] });
    },
    [qc],
  );

  /**
   * Activation by invitation link. Stores the session exactly the way OTP
   * verification does — same helpers, same tenant auto-selection — because a
   * session that arrives by a different route must still behave identically.
   */
  const joinWithToken = useCallback(
    async (token: string): Promise<JoinResult> => {
      const body = await apiFetch<JoinResult>(
        `/auth/join/${encodeURIComponent(token)}`,
        { method: 'POST' },
      );

      if (body.status !== 'joined' || !body.auth) return body;

      setTokens(body.auth.accessToken, body.auth.refreshToken);
      if (body.auth.requiresTenantSelection && body.auth.tenants?.[0]) {
        const selected = await apiFetch<{ accessToken: string }>('/auth/select-tenant', {
          method: 'POST',
          body: JSON.stringify({ tenantId: body.auth.tenants[0].id }),
        });
        setTokens(selected.accessToken);
      }
      await qc.invalidateQueries({ queryKey: ['session'] });
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
      requestOtp,
      verifyOtp,
      joinWithToken,
      logout,
    }),
    [session, sessionQuery.isPending, requestOtp, verifyOtp, joinWithToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
