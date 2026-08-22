import { EmptyState } from '@saw/ui';

/**
 * Rendered for a manifest key the server promises but this app has not built
 * yet. Better than dropping the tab silently: the user sees the feature exists
 * and is coming, instead of wondering where it went.
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-h1 text-grey-900">{title}</h1>
      <div className="mt-6">
        <EmptyState
          headline="Coming soon"
          body="Your school has switched this on, but the screen is still being built here. It is already available in the School All Ways app."
        />
      </div>
    </div>
  );
}
