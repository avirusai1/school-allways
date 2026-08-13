import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CheckCircle, EmptyState, ErrorState, Icon, Select, Skeleton } from '@saw/ui';
import {
  pickCurrentSession,
  toSectionOptions,
  useClasses,
  useSections,
  useSessions,
} from '../../academic/useAcademic';

type Props = {
  branchId: string;
  /** Set once the first register is saved — the activation event. */
  activatedAt: string | null;
  onSkipStep: () => void;
  onFinish: () => void;
  busy?: boolean;
};

/**
 * Deliberately not another attendance UI: this is an explainer plus a deep link
 * into the real register at /attendance, which sets `tenants.activatedAt`
 * server-side on the first successful mark. Coming back here with activatedAt
 * set is what shows the completion screen.
 */
export function FirstAttendanceStep({
  branchId,
  activatedAt,
  onSkipStep,
  onFinish,
  busy,
}: Props) {
  const navigate = useNavigate();
  const sessionsQ = useSessions(branchId);
  const current = pickCurrentSession(sessionsQ.data);
  const sectionsQ = useSections(branchId, current?.id);
  const classesQ = useClasses(branchId);

  const options = useMemo(
    () => toSectionOptions(sectionsQ.data, classesQ.data),
    [sectionsQ.data, classesQ.data],
  );

  // Lowest class level with students, else simply the first section.
  const defaultSection =
    options.find((o) => o.studentCount > 0)?.id ?? options[0]?.id ?? '';
  const [sectionId, setSectionId] = useState<string>('');
  const chosen = sectionId || defaultSection;

  if (activatedAt) {
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="text-green-500">
          <Icon icon={CheckCircle} size="empty" />
        </span>
        <p className="text-h3 text-grey-900">
          Your school is live on School All Ways.
        </p>
        <Button variant="primary" loading={busy} onClick={onFinish}>
          Go to your dashboard →
        </Button>
      </div>
    );
  }

  // The sections query is disabled until a session exists, and a disabled query
  // never leaves `isPending` — waiting on it would hang this step forever for a
  // school that skipped step 2.
  if (sessionsQ.isPending || classesQ.isPending || (current && sectionsQ.isPending)) {
    return <Skeleton height={200} className="w-full" />;
  }

  if (sessionsQ.isError || (current && sectionsQ.isError) || classesQ.isError) {
    return (
      <ErrorState
        message="Could not load your classes. Try again in a moment."
        onRetry={() => {
          void sessionsQ.refetch();
          void sectionsQ.refetch();
          void classesQ.refetch();
        }}
      />
    );
  }

  // Reachable whenever steps 3–4 were skipped — every step is independently
  // skippable, so this is a normal state, not a corrupt one.
  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {current ? (
          <EmptyState
            headline="No classes to mark yet"
            body="Attendance needs at least one class with a section. Add them, then come back — this step will be waiting."
            actionLabel="Set up classes"
            onAction={() => navigate('/setup/classes')}
          />
        ) : (
          <EmptyState
            headline="No academic session yet"
            body="Attendance is recorded against a session. Create this year's session and its classes, then come back — this step will be waiting."
            actionLabel="Set up the session"
            onAction={() => navigate('/setup/sessions')}
          />
        )}
        <button
          type="button"
          className="self-start text-body-small text-grey-600 hover:text-grey-900 hover:underline"
          onClick={onSkipStep}
        >
          I&rsquo;ll do this tomorrow
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Select
        label="Class"
        className="max-w-xs"
        value={chosen}
        onChange={(e) => setSectionId(e.target.value)}
        options={options.map((o) => ({
          value: o.id,
          label: `${o.label} · ${o.studentCount} students`,
        }))}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!chosen}
          onClick={() =>
            navigate(`/attendance?sectionId=${chosen}&returnTo=onboarding`)
          }
        >
          Take attendance now →
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onSkipStep}>
          I&rsquo;ll do this tomorrow
        </Button>
      </div>

      <p className="text-body-small text-grey-600">
        Skipping finishes setup and takes you into the app. Your school counts as
        live once a register is actually marked.
      </p>
    </div>
  );
}
