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
  ChalkboardTeacher,
} from '@saw/ui';
import {
  pickCurrentSession,
  useAcademicMutations,
  useClasses,
  useSections,
  useSessions,
  type BoardTemplate,
} from './useAcademic';

export type SetupVariant = 'wizard' | 'page';

export type ClassesStepHandle = {
  save: () => Promise<number>;
};

type DraftSection = { name: string; capacity?: number };
type DraftClass = {
  key: string;
  id?: string;
  name: string;
  level: number;
  stage?: string;
  stream?: string;
  sections: DraftSection[];
  capacity: number;
};

type Props = {
  variant: SetupVariant;
  branchId: string;
  /** From school profile — defaults the template radio. */
  defaultBoard?: BoardTemplate | 'scratch';
};

const TEMPLATES: Array<{
  id: BoardTemplate | 'scratch';
  label: string;
  detail: string;
}> = [
  { id: 'cbse', label: 'CBSE', detail: 'Nursery to XII · 15 classes' },
  { id: 'icse', label: 'ICSE', detail: 'Nursery to XII · 15 classes' },
  { id: 'state', label: 'State board', detail: 'Same ladder as CBSE naming' },
  { id: 'scratch', label: 'Start from scratch', detail: 'Add classes yourself' },
];

function nextSectionName(existing: string[]): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const ch of letters) {
    if (!existing.includes(ch)) return ch;
  }
  return `S${existing.length + 1}`;
}

export const ClassesStep = forwardRef<ClassesStepHandle, Props>(
  function ClassesStep({ variant, branchId, defaultBoard = 'cbse' }, ref) {
  const sessionsQ = useSessions(branchId);
  const session = pickCurrentSession(sessionsQ.data);
  const classesQ = useClasses(branchId);
  const sectionsQ = useSections(branchId, session?.id);
  const { applyTemplate, saveClasses } = useAcademicMutations(branchId);

  const [template, setTemplate] = useState<BoardTemplate | 'scratch'>(defaultBoard);
  const [rows, setRows] = useState<DraftClass[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTemplate(defaultBoard);
  }, [defaultBoard]);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!session) throw new Error('Create an academic session before saving classes.');
      if (rows.length === 0 || !rows.every((r) => r.name.trim())) {
        throw new Error('Add at least one named class before continuing.');
      }
      await saveClasses.mutateAsync({
        academicSessionId: session.id,
        classes: rows.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          level: r.level,
          stage: r.stage,
          stream: r.stream,
          sections: r.sections.map((s) => ({
            name: s.name,
            capacity: s.capacity ?? r.capacity,
          })),
        })),
      });
      setDirty(false);
      return rows.length;
    },
  }));

  useEffect(() => {
    if (dirty || !classesQ.data || !sectionsQ.data) return;
    const byClass = new Map<string, DraftSection[]>();
    for (const s of sectionsQ.data) {
      const list = byClass.get(s.classId) ?? [];
      list.push({ name: s.name, capacity: s.capacity ?? undefined });
      byClass.set(s.classId, list);
    }
    setRows(
      classesQ.data.map((c) => {
        const secs = byClass.get(c.id) ?? [{ name: 'A', capacity: 40 }];
        return {
          key: c.id,
          id: c.id,
          name: c.name,
          level: c.level,
          stage: c.stage ?? undefined,
          stream: c.stream ?? undefined,
          sections: secs,
          capacity: secs[0]?.capacity ?? 40,
        };
      }),
    );
  }, [classesQ.data, sectionsQ.data, dirty]);

  const loading = sessionsQ.isPending || classesQ.isPending || sectionsQ.isPending;
  const error = sessionsQ.error ?? classesQ.error ?? sectionsQ.error;

  // Wizard chrome (overline / h1 / body) lives in OnboardingLayout.
  const chrome =
    variant === 'page' ? (
      <div className="mb-6">
        <p className="text-caption uppercase tracking-wide text-grey-500">Setup</p>
        <h1 className="mt-1 text-h1 text-grey-900">Classes</h1>
        <p className="mt-1 text-body-small text-grey-600">
          Start from a board template, then edit sections as chips.
        </p>
      </div>
    ) : null;

  if (!session && !sessionsQ.isPending) {
    return (
      <EmptyState
        icon={<Icon icon={ChalkboardTeacher} size="empty" />}
        headline="Create a session first"
        body="Classes need an academic session before sections can be saved."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Could not load classes.'}
        onRetry={() => {
          void sessionsQ.refetch();
          void classesQ.refetch();
          void sectionsQ.refetch();
        }}
      />
    );
  }

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
                  <label className="flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 hover:bg-grey-50">
                    <input
                      type="radio"
                      name="class-template"
                      className="mt-1"
                      checked={template === t.id}
                      onChange={() => setTemplate(t.id)}
                    />
                    <span>
                      <span className="block text-body font-medium text-grey-900">
                        {t.label}
                      </span>
                      <span className="text-body-small text-grey-600">{t.detail}</span>
                    </span>
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
                  setMessage(null);
                  const res = await applyTemplate.mutateAsync({
                    board: template,
                    academicSessionId: session.id,
                    include: ['classes'],
                  });
                  setDirty(false);
                  setMessage(
                    `Created ${res.classesCreated} class${res.classesCreated === 1 ? '' : 'es'} from the ${template.toUpperCase()} template.`,
                  );
                }}
              >
                Apply template
              </Button>
            </div>
          </section>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Icon icon={ChalkboardTeacher} size="empty" />}
              headline="No classes yet"
              body="Apply a board template — one click instead of typing 15 names."
              actionLabel="Apply CBSE"
              onAction={() => {
                setTemplate('cbse');
                void applyTemplate.mutateAsync({
                  board: 'cbse',
                  academicSessionId: session.id,
                  include: ['classes'],
                });
              }}
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-grey-200">
              <table className="w-full min-w-[640px] text-left text-body-small">
                <thead className="border-b border-grey-200 bg-grey-50 text-caption uppercase text-grey-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">Sections</th>
                    <th className="px-3 py-2 font-medium">Capacity</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.key} className="border-b border-grey-100">
                      <td className="px-3 py-2">
                        <input
                          aria-label="Class name"
                          className="h-10 w-full rounded-sm border border-grey-300 bg-grey-0 px-3 text-body text-grey-900"
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
                        <div className="flex flex-wrap items-center gap-1">
                          {row.sections.map((sec) => (
                            <button
                              key={sec.name}
                              type="button"
                              className="inline-flex h-6 items-center rounded-full bg-grey-50 px-2 text-caption text-grey-700"
                              onClick={() => {
                                setDirty(true);
                                setRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          sections: r.sections.filter(
                                            (s) => s.name !== sec.name,
                                          ),
                                        }
                                      : r,
                                  ),
                                );
                              }}
                              title="Remove section"
                            >
                              {sec.name}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="inline-flex h-6 items-center rounded-full border border-grey-300 px-2 text-caption text-blue-600"
                            onClick={() => {
                              setDirty(true);
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        sections: [
                                          ...r.sections,
                                          {
                                            name: nextSectionName(
                                              r.sections.map((s) => s.name),
                                            ),
                                            capacity: r.capacity,
                                          },
                                        ],
                                      }
                                    : r,
                                ),
                              );
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="w-24 px-3 py-2">
                        <input
                          aria-label="Capacity"
                          type="number"
                          className="h-10 w-full rounded-sm border border-grey-300 bg-grey-0 px-3 text-body text-grey-900"
                          value={String(row.capacity)}
                          onChange={(e) => {
                            const capacity = Number(e.target.value) || 0;
                            setDirty(true);
                            setRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      capacity,
                                      sections: r.sections.map((s) => ({
                                        ...s,
                                        capacity,
                                      })),
                                    }
                                  : r,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-caption text-red-600"
                          onClick={() => {
                            setDirty(true);
                            setRows((prev) => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          Remove
                        </button>
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
                    name: '',
                    level: prev.length + 1,
                    sections: [{ name: 'A', capacity: 40 }],
                    capacity: 40,
                  },
                ]);
              }}
            >
              Add class
            </Button>
            {variant === 'page' ? (
              <Button
                variant="primary"
                size="compact"
                loading={saveClasses.isPending}
                disabled={rows.length === 0 || !rows.every((r) => r.name.trim())}
                onClick={async () => {
                  setMessage(null);
                  await saveClasses.mutateAsync({
                    academicSessionId: session.id,
                    classes: rows.map((r) => ({
                      id: r.id,
                      name: r.name.trim(),
                      level: r.level,
                      stage: r.stage,
                      stream: r.stream,
                      sections: r.sections.map((s) => ({
                        name: s.name,
                        capacity: s.capacity ?? r.capacity,
                      })),
                    })),
                  });
                  setDirty(false);
                  setMessage('Classes saved.');
                }}
              >
                Save classes
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
