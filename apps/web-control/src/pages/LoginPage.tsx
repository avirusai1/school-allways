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
  const [busy, setBusy] = useState(false);

  if (!isLoading && isAuthenticated) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithPassword(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grey-25 px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-md bg-surface-container-low p-6"
      >
        <h1 className="text-h1 text-grey-900">Platform control</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Aggregate metrics only — no tenant student data.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-body-small text-red-700">{error}</p>}
          <Button type="submit" loading={busy} expanded>
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}
