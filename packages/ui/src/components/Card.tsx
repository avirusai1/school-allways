import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  floating?: boolean;
  padding?: boolean;
}

/**
 * For genuinely separate objects only — never wrap a list.
 *
 * M3 "tonal elevation": a card is a step up the surface-container scale from
 * the page, not a white box with a hairline border. `floating` takes one
 * more step (surface-container, vs the default surface-container-low) plus a
 * soft shadow — M3 elevated cards use both cues together.
 */
export function Card({
  children,
  floating = false,
  padding = true,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-md',
        floating ? 'bg-surface-container shadow-sm' : 'bg-surface-container-low',
        padding ? 'p-4' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
