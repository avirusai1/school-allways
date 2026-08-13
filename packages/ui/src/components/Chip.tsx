export type ChipTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  className?: string;
}

const toneClass: Record<ChipTone, string> = {
  neutral: 'bg-grey-50 text-grey-700',
  success: 'bg-green-50 text-green-700',
  danger: 'bg-red-50 text-red-700',
  warning: 'bg-orange-50 text-orange-700',
  info: 'bg-cyan-50 text-cyan-700',
  accent: 'bg-amber-50 text-grey-900',
};

/** Always carries a letter or word — never colour alone. */
export function Chip({ label, tone = 'neutral', className = '' }: ChipProps) {
  return (
    <span
      className={[
        'inline-flex h-6 items-center rounded-full px-2 text-caption',
        toneClass[tone],
        className,
      ].join(' ')}
    >
      {label}
    </span>
  );
}
