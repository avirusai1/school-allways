import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required — every icon-only button has a semantic label. */
  label: string;
  icon: ReactNode;
  /** Touch target size; visual icon stays ≤24 unless empty-state. */
  size?: 40 | 48;
}

export function IconButton({
  label,
  icon,
  size = 48,
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center rounded-sm text-grey-700',
        'hover:bg-grey-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
        'disabled:text-grey-400 disabled:cursor-not-allowed',
        'transition-colors duration-instant ease-standard',
        className,
      ].join(' ')}
      style={{ width: size, height: size, minWidth: 48, minHeight: 48 }}
      {...rest}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </span>
    </button>
  );
}
