import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  floating?: boolean;
  padding?: boolean;
}

/** For genuinely separate objects only — never wrap a list. */
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
        'rounded-md border border-grey-200 bg-grey-0',
        floating ? 'shadow-sm' : '',
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
