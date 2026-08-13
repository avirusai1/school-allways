import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  error?: string;
  hint?: string;
}

/** Label sits ABOVE the field — never floating (build/11 §9). */
export function TextField({
  label,
  error,
  hint,
  className = '',
  disabled,
  id,
  ...rest
}: TextFieldProps) {
  const fieldId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();
  const hasError = Boolean(error);

  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={fieldId} className="text-label text-grey-700 mb-[6px]">
        {label}
      </label>
      <input
        id={fieldId}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${fieldId}-error` : undefined}
        className={[
          'h-12 w-full rounded-sm px-3 py-[14px] text-body text-grey-900',
          'border placeholder:text-grey-400',
          'focus:outline-none focus:border-2 focus:border-blue-500',
          hasError ? 'border-2 border-red-500' : 'border-grey-300',
          disabled ? 'bg-grey-50 text-grey-400' : 'bg-grey-0',
        ].join(' ')}
        {...rest}
      />
      {hasError ? (
        <p id={`${fieldId}-error`} className="mt-1 text-body-small text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-body-small text-grey-500">{hint}</p>
      ) : null}
    </div>
  );
}
