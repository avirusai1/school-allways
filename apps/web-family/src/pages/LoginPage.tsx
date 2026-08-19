import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, TextField } from '@saw/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { isAuthenticated, isLoading, loginWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invitationPending, setInvitationPending] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isLoading && isAuthenticated) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInvitationPending(false);
    try {
      await loginWithPassword(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVITATION_PENDING') {
        setInvitationPending(true);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grey-25 px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-md border border-grey-200 bg-grey-0 p-6"
      >
        <h1 className="text-h1 text-grey-900">Parent portal</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Sign in with the email your school invited.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {invitationPending && (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-body-small text-grey-800"
            >
              <p className="font-medium text-grey-900">Invitation not opened yet</p>
              <p className="mt-1">
                {error ??
                  'You have an invitation waiting — check your email for the join link from your school.'}
              </p>
              <p className="mt-2 text-caption text-grey-600">
                Open that link once to set your password, then sign in here.
              </p>
            </div>
          )}
          {error && !invitationPending && (
            <p className="text-body-small text-red-700">{error}</p>
          )}
          <Button type="submit" loading={busy} expanded>
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}
