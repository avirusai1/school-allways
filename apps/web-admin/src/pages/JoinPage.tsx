import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, CheckCircle, ErrorState, Icon, Skeleton, TextField } from '@saw/ui';

import { ApiError } from '../lib/api';
import { useAuth, type JoinResult } from '../lib/auth';

const MIN_PASSWORD_LENGTH = 12;

/**
 * Staff side of the invitation link. Preview names the school; they set a
 * password before a session is issued.
 */
export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { previewJoin, activateJoin } = useAuth();

  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        setResult(await previewJoin(token));
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'We could not open this invitation. Check your connection and try again.',
        );
      }
    })();
  }, [token, previewJoin]);

  if (!token) return <Navigate to="/login" replace />;

  if (error && !result) {
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
        body="This invitation has been used. Sign in with your email and password to continue."
        onContinue={() => navigate('/login')}
        cta="Sign in"
      />
    );
  }

  if (result.status === 'pending') {
    async function onActivate(e: FormEvent) {
      e.preventDefault();
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('The two passwords do not match.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        setResult(await activateJoin(token, password));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not set your password. Try again.');
      } finally {
        setBusy(false);
      }
    }

    return (
      <Shell>
        <h1 className="text-h1 text-grey-900">
          Welcome to {result.schoolName ?? 'School All Ways'}
        </h1>
        <p className="mt-2 text-body-small text-grey-600">
          Set a password to finish setting up your staff account.
        </p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void onActivate(e)}>
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <p className="text-caption text-grey-600">At least {MIN_PASSWORD_LENGTH} characters.</p>
          {error && <p className="text-body-small text-red-700">{error}</p>}
          <Button type="submit" loading={busy} expanded>
            Set password and continue
          </Button>
        </form>
      </Shell>
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
        <p className="mt-2 text-body-small text-grey-600">Your account is active.</p>
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
      <div className="w-full max-w-md rounded-md bg-surface-container-low p-6">
        {children}
      </div>
    </div>
  );
}
