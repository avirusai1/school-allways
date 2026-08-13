import { Chip, type ChipTone } from './Chip';

export type FeeStatus =
  | 'paid'
  | 'partial'
  | 'due'
  | 'overdue'
  | 'waived'
  | 'cancelled';

const META: Record<FeeStatus, { label: string; tone: ChipTone }> = {
  paid: { label: 'Paid', tone: 'success' },
  partial: { label: 'Partial', tone: 'warning' },
  due: { label: 'Due', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'danger' },
  waived: { label: 'Waived', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function FeeStatusBadge({ status }: { status: FeeStatus }) {
  const m = META[status];
  return <Chip label={m.label} tone={m.tone} />;
}
