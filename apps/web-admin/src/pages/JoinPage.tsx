import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, CheckCircle, ErrorState, Icon, Skeleton } from '@saw/ui';

import { ApiError } from '../lib/api';
import { useAuth, type JoinResult } from '../lib/auth';

/**
 * Staff side of the invitation link. Simpler than the family one: a teacher's
 * record comes from the school's own HR file, so there is nothing for them to
 * self-fill — confirm who they are and let them in.
 */
export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { joinWithToken } = useAuth();

  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The token is single-use; StrictMode's second pass would burn it.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        setResult(await joinWithToken(token));
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'We could not open this invitation. Check your connection and try again.',
        );
      }
    })();
  }, [token, joinWithToken]);

  if (!token) return <Navigate to="/login" replace />;

  if (error) {
    return (
      <Shell>
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell>
        <Skeleton height={28} className="w-2/3" />
        <Skeleton height={16} className="mt-3 w-full" />
        <Skeleton height={44} className="mt-6 w-full" />
      </Shell>
    );
  }

  if (result.status === 'invalid') {
    return (
      <Outcome
        title="This link isn't valid"
        body="It may have been typed incorrectly, or replaced by a newer invitation. Ask your school office to send it again."
        onContinue={() => navigate('/login')}
        cta="Go to sign in"
      />
    );
  }

  if (result.status === 'expired') {
    return (
      <Outcome
        title="This invitation has expired"
        body={`Invitations are valid for 14 days. Ask ${
          result.schoolName ?? 'your school'
        } to resend yours, then open the new link.`}
        onContinue={() => navigate('/login')}
        cta="Go to sign in"
      />
    );
  }

  if (result.status === 'already_activated') {
    return (
      <Outcome
        title="You're already set up"
        body="This invitation has been used. Sign in to continue."
        onContinue={() => navigate('/login')}
        cta="Sign in"
      />
    );
  }

  return (
    <Shell>
      <Icon icon={CheckCircle} size="standalone" className="text-green-500" />
      <h1 className="mt-3 text-h1 text-grey-900">
        Welcome to {result.schoolName ?? 'School All Ways'}
      </h1>
      {result.staff ? (
        <p className="mt-2 text-body-small text-grey-600">
          You&apos;re signed in as {result.staff.name}
          {result.staff.designation ? `, ${result.staff.designation}` : ''}
          {result.staff.department ? ` (${result.staff.department})` : ''}.
        </p>
      ) : (
        <p className="mt-2 text-body-small text-grey-600">
          Your account is active.
        </p>
      )}
      <Button className="mt-6" expanded onClick={() => navigate('/')}>
        Go to dashboard
      </Button>
    </Shell>
  );
}

function Outcome({
  title,
  body,
  cta,
  onContinue,
}: {
  title: string;
  body: string;
  cta: string;
  onContinue: () => void;
}) {
  return (
    <Shell>
      <h1 className="text-h1 text-grey-900">{title}</h1>
      <p className="mt-2 text-body-small text-grey-600">{body}</p>
      <Button className="mt-6" expanded onClick={onContinue}>
        {cta}
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
