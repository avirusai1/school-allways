import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ErrorState, ListRow, SectionHeader, Skeleton, StatTile } from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches FamilyService.selfHome() — same keys as the guardian home feed. */
type StudentHome = {
  student: {
    id: string;
    fullName: string;
    firstName: string;
    photoUrl: string | null;
    classLabel: string | null;
    rollNo: string | null;
  };
  today: {
    day: string;
    attendance: { status: string; label: string };
    homeworkDueCount: number;
  };
  needsAttention: Array<{ severity: string; title: string; route: string }>;
  homeworkDue: Array<{ id: string; title: string; dueOn: string | null }>;
  notices: Array<{ id: string; title: string; body: string | null; sentAt: string | null }>;
};

export function StudentHomePage() {
  const q = useQuery({
    queryKey: ['family', 'me'],
    queryFn: () => apiFetch<StudentHome>('/family/me'),
  });

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height={48} className="w-64" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
        <Skeleton height={160} className="w-full" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <ErrorState
        message={q.error instanceof Error ? q.error.message : 'Could not load your home'}
        onRetry={() => void q.refetch()}
      />
    );
  }

  const data = q.data!;
  const { student, today, needsAttention, homeworkDue, notices } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-grey-900">Hello, {student.firstName}</h1>
        <p className="mt-1 text-body-small text-grey-600">
          {[student.classLabel, student.rollNo ? `Roll ${student.rollNo}` : null]
            .filter(Boolean)
            .join(' · ') || 'Your school account'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Today" value={today.attendance.label} />
        <StatTile label="Homework due today" value={String(today.homeworkDueCount)} />
        <StatTile
          label="Overdue"
          value={String(needsAttention.length)}
          tone={needsAttention.length > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <section>
        <SectionHeader title="Homework" />
        <Card>
          {homeworkDue.length === 0 ? (
            <EmptyState headline="Nothing due" body="No homework is pending right now." />
          ) : (
            homeworkDue.map((h) => (
              <ListRow key={h.id} title={h.title} subtitle={h.dueOn ? `Due ${h.dueOn}` : 'No due date'} />
            ))
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="Notices" />
        <Card>
          {notices.length === 0 ? (
            <EmptyState headline="No notices" body="Announcements from your school appear here." />
          ) : (
            notices.map((n) => (
              <ListRow key={n.id} title={n.title} subtitle={n.body ?? undefined} />
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
