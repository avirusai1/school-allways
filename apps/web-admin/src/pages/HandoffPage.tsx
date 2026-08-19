import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorState, Skeleton } from '@saw/ui';

import { ApiError } from '../lib/api';
import { useAuth, type JoinResult } from '../lib/auth';

/**
 * Where the public signup form lands. The marketing site and this app are
 * different origins, so the new admin arrives holding a one-time code rather
 * than a session — see `signup.service.ts` for why the session itself must not
 * travel in the URL.
 *
 * Redeem it and go straight to the wizard. Nothing to confirm: they typed the
 * OTP thirty seconds ago on the previous screen.
 */
export function HandoffPage() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const navigate = useNavigate();
  const { handoffWithCode } = useAuth();

  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single-use code; StrictMode's second pass would spend it.
  const attempted = useRef(false);

  useEffect(() => {
    if (!code || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        const res = await handoffWithCode(code);
        setResult(res);
        if (res.status === 'joined') navigate('/onboarding', { replace: true });
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'We could not open your school. Check your connection and try again.',
        );
      }
    })();
  }, [code, handoffWithCode, navigate]);

  if (!code) return <Navigate to="/login" replace />;

  if (error) {
    return (
      <Shell>
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </Shell>
    );
  }

  if (!result || result.status === 'joined') {
    return (
      <Shell>
        <Skeleton height={28} className="w-2/3" />
        <Skeleton height={16} className="mt-3 w-full" />
        <Skeleton height={44} className="mt-6 w-full" />
      </Shell>
    );
  }

  const closed = result.status;
  if (closed === 'pending') {
    return (
      <Shell>
        <Skeleton height={28} className="w-2/3" />
        <Skeleton height={16} className="mt-3 w-full" />
        <Skeleton height={44} className="mt-6 w-full" />
      </Shell>
    );
  }

  // Three outcomes, three different things to say. They all end at the login
  // screen, but telling someone their school "has been used" when the code was
  // mistyped sends them looking for a problem that isn't there.
  const outcome = {
    invalid: {
      title: "This link isn't valid",
      body: 'The address may have been copied incompletely. Open the link from your browser history, or sign in if you have already created your school.',
    },
    expired: {
      title: 'This link has expired',
      body: `${result.schoolName ? `${result.schoolName} was created. ` : 'Your school was created. '}The setup link is only valid for a few minutes, so sign in to carry on.`,
    },
    already_activated: {
      title: 'This link has been used',
      body: `${result.schoolName ? `${result.schoolName} is set up. ` : ''}Sign in to carry on where you left off.`,
    },
  }[closed];

  return (
    <Shell>
      <h1 className="text-h1 text-grey-900">{outcome.title}</h1>
      <p className="mt-2 text-body-small text-grey-600">{outcome.body}</p>
      <Button className="mt-6" expanded onClick={() => navigate('/login')}>
        Sign in
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grey-25 px-4">
      <div className="w-full max-w-md rounded-md border border-grey-200 bg-grey-0 p-6">
        {children}
      </div>
    </div>
  );
}
