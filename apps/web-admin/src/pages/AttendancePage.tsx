import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, Select, Skeleton } from '@saw/ui';
import { AttendanceMarker } from '../features/attendance/AttendanceMarker';
import { todayIso } from '../features/attendance/useAttendance';
import {
  pickCurrentSession,
  toSectionOptions,
  useClasses,
  useSections,
  useSessions,
} from '../features/academic/useAcademic';
import { useAuth } from '../lib/auth';

/**
 * Standalone register, and the target step 9 of onboarding deep-links into.
 * `?sectionId=` preselects a class; `?returnTo=onboarding` sends the user back
 * to the wizard once the register is saved, so activation closes the loop.
 */
export function AttendancePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  const day = params.get('day') ?? todayIso();
  const returnTo = params.get('returnTo');

  const sessionsQ = useSessions(branchId);
  const current = pickCurrentSession(sessionsQ.data);
  const sectionsQ = useSections(branchId, current?.id);
  const classesQ = useClasses(branchId);

  const options = useMemo(
    () => toSectionOptions(sectionsQ.data, classesQ.data),
    [sectionsQ.data, classesQ.data],
  );

  const [picked, setPicked] = useState<string | null>(params.get('sectionId'));
  const sectionId = picked ?? options[0]?.id ?? null;

  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session before marking attendance."
      />
    );
  }

  // Sections stay disabled — and therefore pending forever — until a session
  // exists, so only wait on that query once it can actually run.
  if (sessionsQ.isPending || classesQ.isPending || (current && sectionsQ.isPending)) {
    return <Skeleton height={240} className="w-full" />;
  }

  if (!current) {
    return (
      <EmptyState
        headline="No academic session yet"
        body="Create this year's session before marking attendance."
        actionLabel="Set up sessions"
        onAction={() => navigate('/setup/sessions')}
      />
    );
  }

  if (options.length === 0) {
    return (
      <EmptyState
        headline="No classes set up yet"
        body="Add at least one class with a section, then come back to mark attendance."
        actionLabel="Set up classes"
        onAction={() => navigate('/setup/classes')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-grey-900">Attendance</h1>
        <p className="mt-1 text-body-small text-grey-600">
          {new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      <Select
        label="Class"
        className="max-w-xs"
        value={sectionId ?? ''}
        onChange={(e) => setPicked(e.target.value)}
        options={options.map((o) => ({
          value: o.id,
          label: `${o.label} · ${o.studentCount} students`,
        }))}
      />

      {sectionId ? (
        <AttendanceMarker
          key={sectionId}
          sectionId={sectionId}
          day={day}
          onMarked={() => {
            if (returnTo === 'onboarding') {
              navigate('/onboarding/first_attendance', { replace: true });
            }
          }}
        />
      ) : null}
    </div>
  );
}
