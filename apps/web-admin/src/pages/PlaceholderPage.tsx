import { EmptyState } from '@saw/ui';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-h1 text-grey-900">{title}</h1>
      <div className="mt-6">
        <EmptyState
          headline="Coming soon on web"
          body="This screen is wired in the nav. Bulk/config tools land here next — use the mobile admin app for day-to-day work in the meantime."
        />
      </div>
    </div>
  );
}
