import { forwardRef } from 'react';
import { WizardImportStep, type ImportStepHandle } from './ImportStep';

export type { ImportStepHandle };

export const ImportStudentsStep = forwardRef<ImportStepHandle, { branchId: string }>(
  function ImportStudentsStep({ branchId }, ref) {
    return <WizardImportStep ref={ref} branchId={branchId} entity="students" />;
  },
);
