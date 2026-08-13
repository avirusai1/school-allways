import { EmptyState } from '@saw/ui';
import { SessionsStep } from '../../features/academic/SessionsStep';
import { useAuth } from '../../lib/auth';

export function SessionsPage() {
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session before managing academic years."
      />
    );
  }
  return <SessionsStep variant="page" branchId={branchId} />;
}
