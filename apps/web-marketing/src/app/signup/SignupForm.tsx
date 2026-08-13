'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, apiPost } from '../../lib/api';

const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_WEB_URL ?? 'http://localhost:5173';

const BOARDS = [
  { value: 'cbse', label: 'CBSE' },
  { value: 'icse', label: 'ICSE' },
  { value: 'ib', label: 'IB' },
  { value: 'cambridge', label: 'Cambridge' },
  { value: 'state_other', label: 'State board' },
  { value: 'other', label: 'Other' },
];

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

type Details = {
  schoolName: string;
  board: string;
  city: string;
  state: string;
  approxStudentCount: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  referralCode: string;
};

const EMPTY: Details = {
  schoolName: '',
  board: 'cbse',
  city: '',
  state: '',
  approxStudentCount: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  referralCode: '',
};

type StartResponse = {
  signupId: string;
  expiresInSeconds: number;
  devOtp?: string;
};

type VerifyResponse = {
  tenantId: string;
  slug: string;
  handoffUrl: string;
};

/**
 * Two steps, because that is what the API does: details create a signup record
 * and send an OTP, the OTP provisions the school. Nothing is created until the
 * phone is proved, so abandoning at step 2 leaves no half-made tenant behind.
 */
export function SignupForm() {
  const [step, setStep] = useState<'details' | 'otp' | 'done'>('details');
  const [details, setDetails] = useState<Details>(EMPTY);
  const [signup, setSignup] = useState<StartResponse | null>(null);
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);

  // Static export, so the referral code has to come off the URL in the browser.
  // A school that clicked a partner's link should not have to retype the code
  // that link exists to carry.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setDetails((d) => ({ ...d, referralCode: ref.toUpperCase() }));
  }, []);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (step !== 'otp') return;
    timer.current = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [step]);

  function set<K extends keyof Details>(key: K, value: Details[K]) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setExistingAccount(false);

    try {
      const res = await apiPost<StartResponse>('/public/signup', {
        schoolName: details.schoolName.trim(),
        board: details.board,
        city: details.city.trim(),
        state: details.state.trim(),
        ...(details.approxStudentCount
          ? { approxStudentCount: Number(details.approxStudentCount) }
          : {}),
        contactName: details.contactName.trim(),
        contactPhone: details.contactPhone.trim(),
        contactEmail: details.contactEmail.trim(),
        ...(details.referralCode.trim() ? { referralCode: details.referralCode.trim() } : {}),
      });
      setSignup(res);
      setSecondsLeft(res.expiresInSeconds);
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Not a failure to fix by editing the form — they already have an
        // account, so the useful thing is a way in, not an error.
        setExistingAccount(true);
      }
      setError(err instanceof ApiError ? err.message : 'Could not start signup.');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!signup) return;
    setBusy(true);
    setError(null);

    try {
      const res = await apiPost<VerifyResponse>(
        `/public/signup/${signup.signupId}/verify`,
        { code: code.trim() },
      );
      setStep('done');
      // One-time code in the URL, never a session token. The admin app
      // redeems it for the real session on arrival.
      window.location.href = res.handoffUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify that code.');
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="mt-8 rounded-md border border-grey-200 bg-grey-0 p-6">
        <p className="text-[15px] text-grey-900">
          {details.schoolName} is ready. Opening your setup wizard&hellip;
        </p>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <form onSubmit={(e) => void onVerify(e)} className="mt-8 space-y-4">
        <p className="text-[15px] text-grey-600">
          We sent a 6-digit code to {details.contactEmail || details.contactPhone}.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setStep('details');
              setError(null);
            }}
          >
            Wrong email?
          </button>
        </p>

        <Field id="code" label="Verification code">
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          />
        </Field>

        <p className="text-[13px] text-grey-600">
          {secondsLeft > 0
            ? `Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}.`
            : 'That code has expired. Go back and start again to get a new one.'}
        </p>
        {signup?.devOtp && (
          <p className="text-[13px] text-grey-600">Dev OTP: {signup.devOtp}</p>
        )}

        {error && <p className="text-[13px] text-red-700">{error}</p>}

        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Creating your school…' : 'Verify and create my school'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void onStart(e)} className="mt-8 space-y-4">
      <Field id="schoolName" label="School name">
        <input
          id="schoolName"
          required
          minLength={3}
          maxLength={200}
          value={details.schoolName}
          onChange={(e) => set('schoolName', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="board" label="Board">
        <select
          id="board"
          required
          value={details.board}
          onChange={(e) => set('board', e.target.value)}
          className={inputClass}
        >
          {BOARDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="city" label="City">
          <input
            id="city"
            required
            minLength={2}
            maxLength={100}
            value={details.city}
            onChange={(e) => set('city', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id="state" label="State">
          <select
            id="state"
            required
            value={details.state}
            onChange={(e) => set('state', e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="approxStudentCount" label="Roughly how many students?" optional>
        <input
          id="approxStudentCount"
          type="number"
          min={1}
          max={50000}
          value={details.approxStudentCount}
          onChange={(e) => set('approxStudentCount', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="contactName" label="Your name">
        <input
          id="contactName"
          required
          minLength={2}
          maxLength={150}
          value={details.contactName}
          onChange={(e) => set('contactName', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        id="contactPhone"
        label="Your mobile number"
        hint="We send a verification code to this number."
      >
        <input
          id="contactPhone"
          type="tel"
          inputMode="numeric"
          required
          pattern="[0-9+ ]{10,15}"
          aria-describedby="contactPhone-hint"
          value={details.contactPhone}
          onChange={(e) => set('contactPhone', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="contactEmail" label="Work email">
        <input
          id="contactEmail"
          type="email"
          required
          maxLength={254}
          value={details.contactEmail}
          onChange={(e) => set('contactEmail', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field id="referralCode" label="Referral code" optional>
        <input
          id="referralCode"
          maxLength={20}
          value={details.referralCode}
          onChange={(e) => set('referralCode', e.target.value.toUpperCase())}
          className={inputClass}
        />
      </Field>

      {error && (
        <div className="rounded-sm border border-red-500 bg-red-50 p-3">
          <p className="text-[13px] text-red-700">{error}</p>
          {existingAccount && (
            <a
              href={`${ADMIN_URL}/login`}
              className="mt-1 inline-block text-[13px] font-medium text-blue-700 underline"
            >
              Sign in instead
            </a>
          )}
        </div>
      )}

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? 'Sending code…' : 'Create my school'}
      </button>

      <p className="text-[13px] text-grey-600">
        Free forever for attendance and parent messaging. No card needed.
      </p>
    </form>
  );
}

const inputClass =
  'h-12 w-full rounded-sm border border-grey-300 bg-grey-0 px-3 text-[15px] outline-none ' +
  'focus:border-2 focus:border-blue-500 disabled:bg-grey-50';

const buttonClass =
  'inline-flex h-12 w-full items-center justify-center rounded-md bg-amber-500 text-[15px] ' +
  'font-semibold text-grey-900 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Explicitly associated rather than wrapping the control, because a `<label>`
 * wrapped around a `<select>` makes every option part of the field's accessible
 * name — a screen reader announces the state picker as "State Andhra Pradesh
 * Arunachal Pradesh…".
 */
function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-medium text-grey-700"
      >
        {label}
        {optional && <span className="font-normal text-grey-500"> (optional)</span>}
      </label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="mt-1 block text-[13px] text-grey-600">
          {hint}
        </span>
      )}
    </div>
  );
}
