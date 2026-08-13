import { forwardRef } from 'react';
import { WizardImportStep, type ImportStepHandle } from './ImportStep';

export type { ImportStepHandle };

export const ImportStaffStep = forwardRef<ImportStepHandle, { branchId: string }>(
  function ImportStaffStep({ branchId }, ref) {
    return <WizardImportStep ref={ref} branchId={branchId} entity="staff" />;
  },
);
