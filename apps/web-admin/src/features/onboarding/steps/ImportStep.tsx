import { forwardRef, useImperativeHandle, useState } from 'react';
import { ImportWizard } from '../../import/ImportWizard';
import type { ImportEntity } from '../../import/import.types';

export type ImportStepHandle = {
  /** Rows actually committed, for the step's `completed` telemetry. */
  save: () => Promise<number>;
};

type Props = {
  branchId: string;
  entity: ImportEntity;
};

/**
 * Steps 5 and 6 are the standalone import wizard in different chrome — same
 * component, same five phases, same vendor selector. Nothing here duplicates
 * import logic; it only carries the committed row count back to the wizard
 * footer so Continue can report it.
 */
export const WizardImportStep = forwardRef<ImportStepHandle, Props>(
  function WizardImportStep({ branchId, entity }, ref) {
    const [committedRows, setCommittedRows] = useState(0);

    useImperativeHandle(ref, () => ({ save: async () => committedRows }), [
      committedRows,
    ]);

    return (
      <div className="flex flex-col gap-4">
        <ImportWizard
          variant="wizard"
          branchId={branchId}
          entity={entity}
          onCommitted={(r) => setCommittedRows(r.committedRows)}
        />
        <p className="text-body-small text-grey-600">
          Not ready? Skip this step — you can import at any time from Imports in the
          sidebar.
        </p>
      </div>
    );
  },
);
