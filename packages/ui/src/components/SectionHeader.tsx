import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: string;
  /** Optional UPPERCASE eyebrow above the title. */
  overline?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  overline,
  action,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`mb-3 flex items-end justify-between gap-3 ${className}`}>
      <div>
        {overline ? (
          <div className="mb-1 text-overline uppercase text-grey-700">{overline}</div>
        ) : null}
        <h2 className="text-h2 text-grey-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}
