import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, TextField } from '@saw/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { isAuthenticated, isLoading, requestOtp, verifyOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitationPending, setInvitationPending] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isLoading && isAuthenticated) return <Navigate to="/" replace />;

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInvitationPending(false);
    try {
      const res = await requestOtp(phone.trim());
      setStep('otp');
      setHint(
        res.devOtp
          ? `Dev OTP: ${res.devOtp}`
          : `OTP sent. Expires in ${res.expiresInSeconds}s.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInvitationPending(false);
    try {
      await verifyOtp(phone.trim(), otp.trim());
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVITATION_PENDING') {
        setInvitationPending(true);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Invalid OTP');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grey-25 px-4">
      <form
        onSubmit={(e) => void (step === 'phone' ? onRequest(e) : onVerify(e))}
        className="w-full max-w-md rounded-md border border-grey-200 bg-grey-0 p-6"
      >
        <h1 className="text-h1 text-grey-900">Parent portal</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Sign in with the mobile number registered at school.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <TextField
            label="Mobile number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={step === 'otp'}
            required
          />
          {step === 'otp' && (
            <TextField
              label="OTP"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
          )}
          {hint && <p className="text-body-small text-grey-600">{hint}</p>}
          {invitationPending && (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-body-small text-grey-800"
            >
              <p className="font-medium text-grey-900">Invitation not opened yet</p>
              <p className="mt-1">
                {error ??
                  'You have an invitation waiting — check your SMS or WhatsApp for the join link from your school.'}
              </p>
              <p className="mt-2 text-caption text-grey-600">
                After you open that link once, you can sign in here with OTP anytime.
              </p>
            </div>
          )}
          {error && !invitationPending && (
            <p className="text-body-small text-red-700">{error}</p>
          )}
          <Button type="submit" loading={busy} expanded>
            {step === 'phone' ? 'Send OTP' : 'Verify & continue'}
          </Button>
          {step === 'otp' && (
            <Button
              type="button"
              variant="ghost"
              expanded
              disabled={busy}
              onClick={() => {
                setStep('phone');
                setOtp('');
                setHint(null);
                setError(null);
                setInvitationPending(false);
              }}
            >
              Use a different number
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
