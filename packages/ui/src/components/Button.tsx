import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'regular' | 'compact' | 'inline';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  expanded?: boolean;
  leading?: ReactNode;
}

/**
 * M3 structure: Filled (primary/secondary/danger — same fill, different
 * brand hue), Outlined, Text. The next-darker ramp stop on hover/active
 * approximates M3's 8%/10% state-layer opacity without needing color-mix();
 * that's already what this ramp is built for.
 */
const variantClass: Record<ButtonVariant, string> = {
  // Primary = amber fill; Secondary = blue fill (build/11 §9)
  primary:
    'bg-amber-500 text-grey-900 hover:bg-amber-600 active:bg-amber-700 focus-visible:outline-amber-700',
  secondary:
    'bg-blue-500 text-grey-0 hover:bg-blue-600 active:bg-blue-700 focus-visible:outline-blue-700',
  outline:
    'bg-transparent text-grey-900 border border-outline hover:bg-primary-container/40 active:bg-primary-container/60 focus-visible:outline-blue-500',
  ghost:
    'bg-transparent text-blue-500 hover:bg-blue-50 active:bg-blue-100 focus-visible:outline-blue-500',
  danger:
    'bg-red-500 text-grey-0 hover:bg-red-700 active:bg-red-700 focus-visible:outline-red-700',
};

// M3's defining button trait: filled/outlined/text buttons are fully
// rounded (a stadium shape), not a fixed corner radius.
const sizeClass: Record<ButtonSize, string> = {
  regular: 'h-12 px-5 rounded-full text-body font-semibold',
  compact: 'h-10 px-4 rounded-full text-[14px] font-medium',
  inline: 'h-8 px-3 rounded-full text-body-small font-medium',
};

export function Button({
  variant = 'primary',
  size = 'regular',
  loading = false,
  expanded = false,
  leading,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const isGhost = variant === 'ghost';
  const resolvedSize = isGhost && size === 'regular' ? 'compact' : size;
  const disabledCls =
    'disabled:bg-grey-100 disabled:text-grey-400 disabled:border-transparent disabled:cursor-not-allowed';

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 transition-colors duration-instant ease-standard',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        variantClass[variant],
        sizeClass[resolvedSize],
        expanded ? 'w-full' : '',
        disabledCls,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : (
        <>
          {leading}
          {children}
        </>
      )}
    </button>
  );
}
