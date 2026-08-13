import { EmptyState } from '@saw/ui';
import { ClassesStep } from '../../features/academic/ClassesStep';
import { useAuth } from '../../lib/auth';

export function ClassesPage() {
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session before editing classes."
      />
    );
  }
  return <ClassesStep variant="page" branchId={branchId} />;
}
