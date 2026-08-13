import { useQuery } from '@tanstack/react-query';
import { Chip, ErrorState, Skeleton, ListRow } from '@saw/ui';
import { apiFetch } from '../lib/api';

type Flag = {
  id: string;
  key: string;
  description?: string;
  enabled?: boolean;
  rolloutPercent?: number;
};

export function FlagsPage() {
  const flags = useQuery({
    queryKey: ['platform', 'flags'],
    queryFn: async () => {
      const raw = await apiFetch<{ data?: Flag[] } | Flag[]>('/platform/flags');
      return Array.isArray(raw) ? raw : (raw.data ?? []);
    },
  });

  return (
    <div>
      <h1 className="text-h1 text-grey-900">Feature flags</h1>
      <p className="mt-1 text-body-small text-grey-600">
        Kill switches take effect within minutes via cache TTL.
      </p>
      <div className="mt-6">
        {flags.isPending && <Skeleton height={160} className="w-full" />}
        {flags.isError && (
          <ErrorState
            message={flags.error instanceof Error ? flags.error.message : 'Failed'}
            onRetry={() => void flags.refetch()}
          />
        )}
        {flags.isSuccess && (
          <div className="overflow-hidden rounded-md border border-grey-200 bg-grey-0">
            {flags.data.length === 0 && (
              <p className="p-4 text-body-small text-grey-500">No flags defined.</p>
            )}
            {flags.data.map((f) => (
              <ListRow
                key={f.id}
                title={f.key}
                subtitle={f.description}
                trailing={
                  <Chip
                    label={f.enabled === false ? 'off' : `${f.rolloutPercent ?? 100}%`}
                    tone={f.enabled === false ? 'danger' : 'success'}
                  />
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
