import { EmptyState } from '@saw/ui';

export function PlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-h1 text-grey-900">{title}</h1>
      <div className="mt-6">
        <EmptyState headline={title} body={body} />
      </div>
    </div>
  );
}
