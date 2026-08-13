import { EmptyState } from '@saw/ui';
import { SubjectsStep } from '../../features/academic/SubjectsStep';
import { useAuth } from '../../lib/auth';

export function SubjectsPage() {
  const { session } = useAuth();
  const branchId = session?.branch?.id;
  if (!branchId) {
    return (
      <EmptyState
        headline="No branch selected"
        body="Choose a branch in your session before editing subjects."
      />
    );
  }
  return <SubjectsStep variant="page" branchId={branchId} />;
}
