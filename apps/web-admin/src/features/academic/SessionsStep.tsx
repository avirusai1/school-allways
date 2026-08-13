import { useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  TextField,
  CalendarBlank,
  formatIndianMoney,
} from '@saw/ui';
import {
  useAcademicMutations,
  useSessions,
  type RolloverPreview,
  type UnpaidDuesWarning,
} from './useAcademic';

function isUnpaidDues(w: string | UnpaidDuesWarning): w is UnpaidDuesWarning {
  return typeof w === 'object' && w.type === 'unpaid_dues';
}
import type { SetupVariant } from './ClassesStep';

type Props = {
  variant: SetupVariant;
  branchId: string;
};

function nextSessionName(current?: string): string {
  if (!current) return '2026-27';
  const m = /^(\d{4})-(\d{2})$/.exec(current);
  if (!m) return `${current}-next`;
  const start = Number(m[1]) + 1;
  const end = String(Number(m[2]) + 1).padStart(2, '0');
  return `${start}-${end}`;
}

export function SessionsStep({ variant, branchId }: Props) {
  const sessionsQ = useSessions(branchId);
  const { createSession, rollover } = useAcademicMutations(branchId);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sourceSessionId, setSourceSessionId] = useState<string>('');
  const [targetName, setTargetName] = useState('');
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const sessions = sessionsQ.data ?? [];
  const source =
    sessions.find((s) => s.id === sourceSessionId) ??
    sessions.find((s) => s.isCurrent) ??
    sessions[0];

  const dryRunViewed =
    preview != null &&
    previewFor === `${source?.id ?? ''}|${targetName.trim()}`;

  const chrome = useMemo(
    () =>
      variant === 'page' ? (
        <div className="mb-6">
          <p className="text-caption uppercase tracking-wide text-grey-500">Setup</p>
          <h1 className="mt-1 text-h1 text-grey-900">Academic sessions</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Sessions, terms, and year rollover with a mandatory dry run.
          </p>
        </div>
      ) : (
        <div className="mb-6">
          <p className="text-caption uppercase tracking-wide text-grey-500">
            Step · Session
          </p>
          <h2 className="mt-1 text-h2 text-grey-900">Academic session</h2>
          <p className="mt-1 text-body-small text-grey-600">
            Name the year and set dates. Rollover always shows a preview first.
          </p>
        </div>
      ),
    [variant],
  );

  if (sessionsQ.isError) {
    return (
      <ErrorState
        message={
          sessionsQ.error instanceof Error
            ? sessionsQ.error.message
            : 'Could not load sessions.'
        }
        onRetry={() => void sessionsQ.refetch()}
      />
    );
  }

  return (
    <div>
      {chrome}

      {sessionsQ.isPending ? <Skeleton height={120} /> : null}

      {!sessionsQ.isPending ? (
        <div className="flex flex-col gap-8">
          <section>
            <h3 className="text-h3 text-grey-900">Sessions</h3>
            {sessions.length === 0 ? (
              <EmptyState
                icon={<Icon icon={CalendarBlank} size="empty" />}
                headline="No sessions yet"
                body="Create the academic year before classes and subjects."
              />
            ) : (
              <ul className="mt-3 divide-y divide-grey-200 rounded-md border border-grey-200">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <p className="text-body font-medium text-grey-900">
                        {s.name}
                        {s.isCurrent ? (
                          <span className="ml-2 text-caption text-green-700">
                            Current
                          </span>
                        ) : null}
                      </p>
                      <p className="text-body-small text-grey-600">
                        {s.startDate} → {s.endDate}
                        {s.isLocked ? ' · Locked' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border border-grey-200 p-4">
            <h3 className="text-h3 text-grey-900">Add session</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <TextField
                label="Name"
                placeholder="2026-27"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Start date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <TextField
                label="End date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="mt-4">
              <Button
                variant="primary"
                size="compact"
                loading={createSession.isPending}
                disabled={!name.trim() || !startDate || !endDate}
                onClick={async () => {
                  await createSession.mutateAsync({
                    name: name.trim(),
                    startDate,
                    endDate,
                    isCurrent: sessions.length === 0,
                  });
                  setName('');
                  setStartDate('');
                  setEndDate('');
                  setMessage('Session created.');
                }}
              >
                Save session
              </Button>
            </div>
          </section>

          <section className="rounded-md border border-grey-200 p-4">
            <h3 className="text-h3 text-grey-900">Year rollover</h3>
            <p className="mt-1 text-body-small text-grey-600">
              Last year stays byte-identical. Commit stays disabled until you
              run and view a dry run for this target.
            </p>

            {!source ? (
              <p className="mt-4 text-body-small text-grey-600">
                Create a source session before rolling over.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-label text-grey-700">From session</span>
                    <select
                      className="h-12 rounded-sm border border-grey-300 bg-grey-0 px-3 text-body"
                      value={source.id}
                      onChange={(e) => {
                        setSourceSessionId(e.target.value);
                        setPreview(null);
                        setPreviewFor(null);
                      }}
                    >
                      {sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    label="Target session name"
                    value={targetName || nextSessionName(source.name)}
                    onChange={(e) => {
                      setTargetName(e.target.value);
                      setPreview(null);
                      setPreviewFor(null);
                    }}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    size="compact"
                    loading={rollover.isPending}
                    onClick={async () => {
                      const target = (targetName || nextSessionName(source.name)).trim();
                      setTargetName(target);
                      const res = await rollover.mutateAsync({
                        sessionId: source.id,
                        dryRun: true,
                        body: {
                          targetSessionName: target,
                          promotionRules: {
                            defaultAction: 'promote',
                            graduatingClassLevel: 12,
                          },
                          carryForward: {
                            rollNumbers: false,
                            houses: true,
                            transport: true,
                            concessions: true,
                          },
                        },
                      });
                      setPreview(res);
                      setPreviewFor(`${source.id}|${target}`);
                      setMessage(null);
                    }}
                  >
                    Run dry run
                  </Button>
                  <Button
                    variant="primary"
                    size="compact"
                    loading={rollover.isPending}
                    disabled={!dryRunViewed}
                    onClick={async () => {
                      const target = (targetName || nextSessionName(source.name)).trim();
                      await rollover.mutateAsync({
                        sessionId: source.id,
                        dryRun: false,
                        body: {
                          targetSessionName: target,
                          promotionRules: {
                            defaultAction: 'promote',
                            graduatingClassLevel: 12,
                          },
                          carryForward: {
                            rollNumbers: false,
                            houses: true,
                            transport: true,
                            concessions: true,
                          },
                        },
                      });
                      setMessage(`Rollover into ${target} committed.`);
                      setPreview(null);
                      setPreviewFor(null);
                    }}
                  >
                    Commit rollover
                  </Button>
                </div>

                {preview ? (
                  <div className="rounded-sm border border-grey-200 bg-grey-50 p-4">
                    <p className="text-body font-medium text-grey-900">Dry-run preview</p>
                    <ul className="mt-2 grid gap-1 text-body-small text-grey-700 sm:grid-cols-2">
                      <li>
                        Would create — classes {preview.wouldCreate.classes}, sections{' '}
                        {preview.wouldCreate.sections}, enrollments{' '}
                        {preview.wouldCreate.enrollments}
                      </li>
                      <li>Would promote — {preview.wouldPromote}</li>
                      <li>Would detain — {preview.wouldDetain}</li>
                      <li>Would graduate — {preview.wouldGraduate}</li>
                    </ul>
                    {preview.warnings.length > 0 ? (
                      <ul className="mt-3 list-disc pl-5 text-body-small text-orange-700">
                        {preview.warnings.map((w) =>
                          isUnpaidDues(w) ? (
                            <li key="unpaid_dues">
                              {w.count} student{w.count === 1 ? '' : 's'} being
                              promoted {w.count === 1 ? 'has' : 'have'} unpaid dues
                              totalling {formatIndianMoney(w.totalPaise, false)}.
                            </li>
                          ) : (
                            <li key={w}>{w}</li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className="mt-3 text-body-small text-green-700">
                        No warnings.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {message ? (
            <p className="text-body-small text-green-700">{message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
