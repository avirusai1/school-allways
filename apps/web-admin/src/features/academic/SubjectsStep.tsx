import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Skeleton,
  Books,
} from '@saw/ui';
import {
  pickCurrentSession,
  useAcademicMutations,
  useClasses,
  useClassSubjectLinks,
  useSessions,
  useSubjects,
  type BoardTemplate,
} from './useAcademic';
import type { SetupVariant } from './ClassesStep';

export type SubjectsStepHandle = {
  save: () => Promise<number>;
};

type DraftSubject = {
  key: string;
  id?: string;
  code: string;
  name: string;
  type: string;
  isScholastic: boolean;
  classIds: string[];
};

type Props = {
  variant: SetupVariant;
  branchId: string;
  defaultBoard?: BoardTemplate | 'scratch';
};

const TYPES = ['core', 'elective', 'language', 'co_curricular'] as const;

const TEMPLATES: Array<{ id: BoardTemplate | 'scratch'; label: string }> = [
  { id: 'cbse', label: 'CBSE subjects' },
  { id: 'icse', label: 'ICSE subjects' },
  { id: 'state', label: 'State board subjects' },
  { id: 'scratch', label: 'Start from scratch' },
];

export const SubjectsStep = forwardRef<SubjectsStepHandle, Props>(
  function SubjectsStep({ variant, branchId, defaultBoard = 'cbse' }, ref) {
  const sessionsQ = useSessions(branchId);
  const session = pickCurrentSession(sessionsQ.data);
  const subjectsQ = useSubjects(branchId);
  const classesQ = useClasses(branchId);
  const linksQ = useClassSubjectLinks(session?.id);
  const { applyTemplate, saveSubjects } = useAcademicMutations(branchId);

  const [template, setTemplate] = useState<BoardTemplate | 'scratch'>(defaultBoard);
  const [rows, setRows] = useState<DraftSubject[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTemplate(defaultBoard);
  }, [defaultBoard]);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!session) throw new Error('Create an academic session before saving subjects.');
      if (rows.length === 0 || !rows.every((r) => r.code.trim() && r.name.trim())) {
        throw new Error('Every subject needs a code and name before continuing.');
      }
      await saveSubjects.mutateAsync({
        academicSessionId: session.id,
        subjects: rows.map((r) => ({
          id: r.id,
          code: r.code.trim(),
          name: r.name.trim(),
          type: r.type,
          isScholastic: r.isScholastic,
          classIds: r.classIds,
        })),
      });
      setDirty(false);
      return rows.length;
    },
  }));

  useEffect(() => {
    if (dirty || !subjectsQ.data || !linksQ.data) return;
    const bySubject = new Map<string, string[]>();
    for (const link of linksQ.data) {
      const list = bySubject.get(link.subjectId) ?? [];
      list.push(link.classId);
      bySubject.set(link.subjectId, list);
    }
    setRows(
      subjectsQ.data.map((s) => ({
        key: s.id,
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.type,
        isScholastic: s.isScholastic,
        classIds: bySubject.get(s.id) ?? [],
      })),
    );
  }, [subjectsQ.data, linksQ.data, dirty]);

  const loading =
    sessionsQ.isPending ||
    subjectsQ.isPending ||
    classesQ.isPending ||
    linksQ.isPending;
  const error =
    sessionsQ.error ?? subjectsQ.error ?? classesQ.error ?? linksQ.error;

  const chrome =
    variant === 'page' ? (
      <div className="mb-6">
        <p className="text-caption uppercase tracking-wide text-grey-500">Setup</p>
        <h1 className="mt-1 text-h1 text-grey-900">Subjects</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Board template first, then code, type, and class mapping.
        </p>
      </div>
    ) : null;

  if (!session && !sessionsQ.isPending) {
    return (
      <EmptyState
        icon={<Icon icon={Books} size="empty" />}
        headline="Create a session first"
        body="Subject–class mapping is stored per academic session."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Could not load subjects.'}
        onRetry={() => {
          void subjectsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }

  const classOptions = classesQ.data ?? [];

  return (
    <div>
      {chrome}
      {loading ? <Skeleton height={160} /> : null}

      {!loading && session ? (
        <div className="flex flex-col gap-6">
          <section className="rounded-md border border-grey-200 p-4">
            <h3 className="text-h3 text-grey-900">Start from a template</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {TEMPLATES.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 hover:bg-grey-50">
                    <input
                      type="radio"
                      name="subject-template"
                      checked={template === t.id}
                      onChange={() => setTemplate(t.id)}
                    />
                    <span className="text-body text-grey-900">{t.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button
                variant="secondary"
                size="compact"
                loading={applyTemplate.isPending}
                disabled={template === 'scratch'}
                onClick={async () => {
                  if (template === 'scratch') return;
                  const res = await applyTemplate.mutateAsync({
                    board: template,
                    academicSessionId: session.id,
                    include: ['subjects'],
                  });
                  setDirty(false);
                  setMessage(
                    `Created ${res.subjectsCreated} subject${res.subjectsCreated === 1 ? '' : 's'}.`,
                  );
                }}
              >
                Apply template
              </Button>
            </div>
          </section>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Icon icon={Books} size="empty" />}
              headline="No subjects yet"
              body="Apply a board template to load the standard subject list."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-grey-200">
              <table className="w-full min-w-[720px] text-left text-body-small">
                <thead className="border-b border-grey-200 bg-grey-50 text-caption uppercase text-grey-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Scholastic</th>
                    <th className="px-3 py-2 font-medium">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.key} className="border-b border-grey-100 align-top">
                      <td className="px-3 py-2">
                        <input
                          aria-label="Subject code"
                          className="h-10 w-20 rounded-sm border border-grey-300 px-2"
                          value={row.code}
                          onChange={(e) => {
                            setDirty(true);
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, code: e.target.value } : r,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label="Subject name"
                          className="h-10 w-full min-w-[140px] rounded-sm border border-grey-300 px-2"
                          value={row.name}
                          onChange={(e) => {
                            setDirty(true);
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, name: e.target.value } : r,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label="Subject type"
                          className="h-10 rounded-sm border border-grey-300 bg-grey-0 px-2"
                          value={row.type}
                          onChange={(e) => {
                            setDirty(true);
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, type: e.target.value } : r,
                              ),
                            );
                          }}
                        >
                          {TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label="Scholastic"
                          checked={row.isScholastic}
                          onChange={(e) => {
                            setDirty(true);
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, isScholastic: e.target.checked }
                                  : r,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {classOptions.map((c) => {
                            const on = row.classIds.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={[
                                  'inline-flex h-6 items-center rounded-full px-2 text-caption',
                                  on
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-grey-50 text-grey-600',
                                ].join(' ')}
                                onClick={() => {
                                  setDirty(true);
                                  setRows((prev) =>
                                    prev.map((r, i) => {
                                      if (i !== idx) return r;
                                      const classIds = on
                                        ? r.classIds.filter((id) => id !== c.id)
                                        : [...r.classIds, c.id];
                                      return { ...r, classIds };
                                    }),
                                  );
                                }}
                              >
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="compact"
              onClick={() => {
                setDirty(true);
                setRows((prev) => [
                  ...prev,
                  {
                    key: `new-${Date.now()}`,
                    code: '',
                    name: '',
                    type: 'core',
                    isScholastic: true,
                    classIds: [],
                  },
                ]);
              }}
            >
              Add subject
            </Button>
            {variant === 'page' ? (
              <Button
                variant="primary"
                size="compact"
                loading={saveSubjects.isPending}
                disabled={
                  rows.length === 0 ||
                  !rows.every((r) => r.code.trim() && r.name.trim())
                }
                onClick={async () => {
                  await saveSubjects.mutateAsync({
                    academicSessionId: session.id,
                    subjects: rows.map((r) => ({
                      id: r.id,
                      code: r.code.trim(),
                      name: r.name.trim(),
                      type: r.type,
                      isScholastic: r.isScholastic,
                      classIds: r.classIds,
                    })),
                  });
                  setDirty(false);
                  setMessage('Subjects saved.');
                }}
              >
                Save subjects
              </Button>
            ) : null}
            {message ? (
              <span className="text-body-small text-green-700">{message}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
},
);
