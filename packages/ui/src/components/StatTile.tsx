import type { ReactNode } from 'react';

/** Only the tones build/14 §11 asks for — a stat is not a paint chart. */
export type StatTileTone = 'neutral' | 'positive' | 'warning' | 'critical';

const VALUE_TONE: Record<StatTileTone, string> = {
  neutral: 'text-grey-900',
  positive: 'text-green-500',
  warning: 'text-amber-500',
  critical: 'text-red-500',
};

export interface StatTileProps {
  /** Large number — shown first (build/11 §10). */
  value: string;
  label: string;
  /** The denominator or the detail: "1,412 of 1,498". */
  caption?: string;
  tone?: StatTileTone;
  /** Turns the tile into a button; the whole surface becomes the target. */
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

/** Dashboard stat: numericLarge value, caption label beneath. */
export function StatTile({
  value,
  label,
  caption,
  tone = 'neutral',
  onClick,
  children,
  className = '',
}: StatTileProps) {
  const body = (
    <>
      <div className={`text-numeric-large tabular-nums ${VALUE_TONE[tone]}`}>
        {value}
      </div>
      <div className="mt-1 text-caption text-grey-500">{label}</div>
      {caption ? (
        <div className="mt-1 text-body-small tabular-nums text-grey-600">
          {caption}
        </div>
      ) : null}
      {children}
    </>
  );

  const surface = [
    'rounded-md border border-grey-200 bg-grey-0 p-4',
    className,
  ].join(' ');

  if (!onClick) return <div className={surface}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${surface} w-full text-left transition-colors duration-fast hover:border-grey-300 hover:bg-grey-25`}
    >
      {body}
    </button>
  );
}
