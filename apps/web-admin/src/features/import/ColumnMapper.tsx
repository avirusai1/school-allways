import { Button, Select } from '@saw/ui';
import type { ColumnMapping, ImportEntity, SuggestedMapping } from './import.types';
import {
  REQUIRED_STAFF_FIELDS,
  REQUIRED_STUDENT_FIELDS,
  STAFF_FIELD_OPTIONS,
  STUDENT_FIELD_OPTIONS,
} from './import.types';

type Props = {
  entity: ImportEntity;
  columns: string[];
  suggested: SuggestedMapping;
  mapping: ColumnMapping;
  onChange: (next: ColumnMapping) => void;
  onBack: () => void;
  onValidate: () => void;
  busy?: boolean;
};

function confidenceLabel(confidence: number | undefined) {
  if (confidence === undefined || confidence < 0.5) {
    return { tone: 'bg-grey-300', label: 'Unmapped' };
  }
  if (confidence < 0.9) {
    return { tone: 'bg-amber-500', label: 'Medium' };
  }
  return { tone: 'bg-green-500', label: 'High' };
}

export function ColumnMapper({
  entity,
  columns,
  suggested,
  mapping,
  onChange,
  onBack,
  onValidate,
  busy,
}: Props) {
  const fieldOptions = entity === 'staff' ? STAFF_FIELD_OPTIONS : STUDENT_FIELD_OPTIONS;
  const required = entity === 'staff' ? REQUIRED_STAFF_FIELDS : REQUIRED_STUDENT_FIELDS;
  const mappedFields = new Set(Object.values(mapping).filter((v) => v !== 'skip'));
  const missingRequired = required.filter((f) => !mappedFields.has(f));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_1fr_5rem] gap-3 px-1 text-overline uppercase text-grey-700">
          <span>Your file</span>
          <span>School All Ways field</span>
          <span>Confidence</span>
        </div>
        {columns.map((header) => {
          const conf = confidenceLabel(suggested[header]?.confidence);
          return (
            <div
              key={header}
              className="grid grid-cols-1 gap-2 border-t border-grey-200 pt-4 md:grid-cols-[1fr_1fr_5rem] md:items-end md:gap-3"
            >
              <p className="text-body text-grey-900 md:pb-3">{header}</p>
              <Select
                label="Map to"
                value={mapping[header] ?? 'skip'}
                onChange={(e) => onChange({ ...mapping, [header]: e.target.value })}
                options={fieldOptions.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
              <div className="flex items-center gap-2 pb-3 text-body-small text-grey-600">
                <span className={`inline-block h-2 w-2 rounded-full ${conf.tone}`} />
                {conf.label}
              </div>
            </div>
          );
        })}
      </div>

      {missingRequired.length > 0 ? (
        <p className="text-body-small text-red-600">
          Map required fields before validating:{' '}
          {missingRequired
            .map((f) => fieldOptions.find((o) => o.value === f)?.label ?? f)
            .join(', ')}
          .
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onValidate}
          loading={busy}
          disabled={missingRequired.length > 0}
        >
          Validate →
        </Button>
      </div>
    </div>
  );
}
