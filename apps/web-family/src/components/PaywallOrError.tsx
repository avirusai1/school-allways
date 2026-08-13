import { ErrorState } from '@saw/ui';
import { PaywallScreen } from '../components/PaywallScreen';
import { isSubscriptionRequired } from '../lib/paywall';
import type { FamilyChild } from '../lib/use-selected-child';

export function PaywallOrError({
  error,
  children,
  highlightId,
  fallback,
  onRetry,
}: {
  error: unknown;
  children: FamilyChild[];
  highlightId?: string | null;
  fallback: string;
  onRetry: () => void;
}) {
  if (isSubscriptionRequired(error)) {
    return <PaywallScreen children={children} highlightId={highlightId} />;
  }
  return (
    <ErrorState
      message={error instanceof Error ? error.message : fallback}
      onRetry={onRetry}
    />
  );
}
