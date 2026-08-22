import { useQuery } from '@tanstack/react-query';
import { EmptyState, Skeleton, ListRow } from '@saw/ui';
import { ChildSwitcher } from '../components/ChildSwitcher';
import { PaywallOrError } from '../components/PaywallOrError';
import { apiFetch } from '../lib/api';
import { useSelectedChild } from '../lib/use-selected-child';

/** Matches BooksService.listBooks() shelf rows. */
type BookRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  bookType?: string | null;
};

export function BooksPage() {
  const { children, studentId, setSelectedChildId } = useSelectedChild();

  const q = useQuery({
    queryKey: ['family', 'books', studentId],
    queryFn: () =>
      apiFetch<{ data: BookRow[] }>(
        `/family/books?studentId=${encodeURIComponent(studentId!)}`,
      ),
    enabled: !!studentId,
  });
  const rows = q.data?.data ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 text-grey-900">Books</h1>
          <p className="mt-1 text-body-small text-grey-600">
            Streaming reader on web. Offline reading is available in the mobile app.
          </p>
        </div>
        <ChildSwitcher
          children={children}
          selectedId={studentId}
          onSelect={setSelectedChildId}
        />
      </div>
      <div className="mt-6">
        {!studentId && <Skeleton height={120} className="w-full" />}
        {studentId && q.isPending && <Skeleton height={120} className="w-full" />}
        {q.isError && (
          <PaywallOrError
            error={q.error}
            children={children}
            highlightId={studentId}
            fallback="Could not load books"
            onRetry={() => void q.refetch()}
          />
        )}
        {q.isSuccess && rows.length === 0 && (
          <EmptyState headline="No books assigned" body="Digital books from school show up here." />
        )}
        {q.isSuccess && rows.length > 0 && (
          <div className="overflow-hidden rounded-md bg-surface-container-low">
            {rows.map((b) => (
              <ListRow
                key={b.id}
                title={b.title}
                subtitle={[b.author, b.subtitle].filter(Boolean).join(' · ') || undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
