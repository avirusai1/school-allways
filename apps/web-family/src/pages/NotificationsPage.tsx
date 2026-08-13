import { Button, Card, EmptyState, ErrorState, Skeleton } from '@saw/ui';

import {
  useMarkNotificationRead,
  useNotificationInbox,
} from '../features/notifications/useNotifications';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function NotificationsPage() {
  const inbox = useNotificationInbox();
  const markRead = useMarkNotificationRead();

  if (inbox.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton height={32} className="w-48" />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    );
  }

  if (inbox.isError) {
    return (
      <ErrorState
        message="Could not load your notifications."
        onRetry={() => void inbox.refetch()}
      />
    );
  }

  const items = inbox.data?.data ?? [];
  const unread = inbox.data?.meta.unread ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-grey-900">Notifications</h1>
        <p className="mt-1 text-body-small text-grey-600">
          {unread > 0 ? `${unread} unread` : 'You are all caught up.'}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          headline="No notifications yet"
          body="Alerts from school — absence notices, invites, and circulars — will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card
                className={[
                  'p-4',
                  item.readAt ? 'bg-grey-0' : 'border-blue-200 bg-blue-50/40',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-grey-900">{item.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-body-small text-grey-700">
                      {item.body}
                    </p>
                    <p className="mt-2 text-caption text-grey-500">
                      {formatWhen(item.createdAt)}
                    </p>
                  </div>
                  {!item.readAt ? (
                    <Button
                      type="button"
                      size="compact"
                      variant="secondary"
                      loading={markRead.isPending}
                      onClick={() => void markRead.mutate(item.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
