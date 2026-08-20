import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ErrorState, ListRow, Skeleton, TextField } from '@saw/ui';
import { apiFetch } from '../lib/api';

/** Matches BooksService.listLibraryItems(). */
type LibraryItem = {
  id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  copiesTotal?: number | null;
  copiesAvailable?: number | null;
};

export function LibraryPage() {
  const [term, setTerm] = useState('');

  const q = useQuery({
    queryKey: ['library', 'items', term],
    queryFn: () =>
      apiFetch<{ data?: LibraryItem[] } | LibraryItem[]>(
        `/books/library/items${term ? `?q=${encodeURIComponent(term)}` : ''}`,
      ),
  });

  const raw = q.data;
  const items: LibraryItem[] = Array.isArray(raw) ? raw : (raw?.data ?? []);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-h1 text-grey-900">Library</h1>

      <TextField
        label="Search"
        placeholder="Title, author or ISBN"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {q.isPending ? (
        <Skeleton height={200} className="w-full" />
      ) : q.isError ? (
        <ErrorState
          message={q.error instanceof Error ? q.error.message : 'Could not load the library'}
          onRetry={() => void q.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          headline={term ? 'Nothing matched' : 'No books listed yet'}
          body={
            term
              ? 'Try a different title, author or ISBN.'
              : 'Your school library catalogue will appear here once it is added.'
          }
        />
      ) : (
        <Card padding={false}>
          {items.map((item) => (
            <ListRow
              key={item.id}
              title={item.title}
              subtitle={
                [
                  item.author,
                  item.copiesAvailable != null
                    ? `${item.copiesAvailable} of ${item.copiesTotal ?? item.copiesAvailable} available`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
            />
          ))}
        </Card>
      )}
    </div>
  );
}
