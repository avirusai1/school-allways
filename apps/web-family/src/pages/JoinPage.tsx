import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, CheckCircle, ErrorState, Icon, Skeleton } from '@saw/ui';

import { ApiError } from '../lib/api';
import { useAuth, type JoinResult } from '../lib/auth';
import { ChildProfileForm } from '../features/join/ChildProfileForm';

/**
 * Where an invitation SMS lands. The token in the URL is the credential, so
 * this page activates the account on mount rather than asking for anything
 * first — the parent has already proved possession of the phone the school
 * has on file by tapping a link only that phone received.
 */
export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { joinWithToken } = useAuth();

  const [result, setResult] = useState<JoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // StrictMode double-invokes effects in development, and this one consumes a
  // single-use token: the second call would come back "already activated" and
  // throw away the session the first one just established.
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
        <Skeleton height={16} className="mt-2 w-4/5" />
        <Skeleton height={44} className="mt-6 w-full" />
      </Shell>
    );
  }

  if (result.status === 'invalid') {
    return (
      <Shell>
        <h1 className="text-h1 text-grey-900">This link isn&apos;t valid</h1>
        <p className="mt-2 text-body-small text-grey-600">
          It may have been typed incorrectly, or replaced by a newer invitation. Ask
          your school to send it again.
        </p>
        <Button className="mt-6" expanded onClick={() => navigate('/login')}>
          Go to sign in
        </Button>
      </Shell>
    );
  }

  if (result.status === 'expired') {
    return (
      <Shell>
        <h1 className="text-h1 text-grey-900">This invitation has expired</h1>
        <p className="mt-2 text-body-small text-grey-600">
          Invitations are valid for 30 days. Ask {result.schoolName ?? 'your school'} to
          resend yours, then open the new link.
        </p>
        <Button className="mt-6" expanded onClick={() => navigate('/login')}>
          Go to sign in
        </Button>
      </Shell>
    );
  }

  if (result.status === 'already_activated') {
    return (
      <Shell>
        <h1 className="text-h1 text-grey-900">You&apos;re already set up</h1>
        <p className="mt-2 text-body-small text-grey-600">
          This invitation has been used. Sign in with your mobile number to continue.
        </p>
        <Button className="mt-6" expanded onClick={() => navigate('/login')}>
          Sign in
        </Button>
      </Shell>
    );
  }

  const students = result.students ?? [];
  const incomplete = students.filter((s) => s.missingFields.length > 0);

  // Confirmation first, form second. A parent's first sight of the product
  // should be proof it has the right child, before it asks them for anything.
  if (!confirmed) {
    return (
      <Shell>
        <Icon icon={CheckCircle} size="standalone" className="text-green-500" />
        <h1 className="mt-3 text-h1 text-grey-900">
          You&apos;re connected to {result.schoolName ?? 'your school'}
        </h1>

        {students.length === 0 ? (
          <p className="mt-2 text-body-small text-grey-600">
            Your account is active. Your school will link your child shortly.
          </p>
        ) : (
          <>
            <p className="mt-2 text-body-small text-grey-600">
              {students.length === 1 ? "You're linked to" : "You're linked to"}
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {students.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-md border border-grey-200 bg-grey-0 p-3"
                >
                  <Avatar name={s.name} src={s.photoUrl ?? undefined} />
                  <div>
                    <p className="text-body text-grey-900">{s.name}</p>
                    {s.className && (
                      <p className="text-caption text-grey-600">
                        Class {s.className}
                        {s.sectionName ? `-${s.sectionName}` : ''}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <Button
          className="mt-6"
          expanded
          onClick={() => (incomplete.length > 0 ? setConfirmed(true) : navigate('/'))}
        >
          {incomplete.length > 0 ? 'Continue' : 'Go to home'}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <ChildProfileForm students={incomplete} onDone={() => navigate('/')} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-grey-25 px-4 py-10">
      <div className="w-full max-w-md rounded-md border border-grey-200 bg-grey-0 p-6">
        {children}
      </div>
    </div>
  );
}
