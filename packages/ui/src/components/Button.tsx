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

const variantClass: Record<ButtonVariant, string> = {
  // Primary = amber fill; Secondary = blue fill (build/11 §9)
  primary: 'bg-amber-500 text-grey-900 hover:bg-amber-600',
  secondary: 'bg-blue-500 text-grey-0 hover:bg-blue-600',
  outline: 'bg-transparent text-grey-900 border border-grey-300 hover:bg-grey-50',
  ghost: 'bg-transparent text-blue-500 hover:bg-blue-50',
  danger: 'bg-red-500 text-grey-0 hover:bg-red-700',
};

const sizeClass: Record<ButtonSize, string> = {
  regular: 'h-12 px-5 rounded-md text-body font-semibold',
  compact: 'h-10 px-4 rounded-sm text-[14px] font-medium',
  inline: 'h-8 px-3 rounded-sm text-body-small font-medium',
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
