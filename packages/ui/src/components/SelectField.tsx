import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  options: SelectOption[];
  errorText?: string;
  hint?: string;
}

/** Label always above the field — never floating. */
export function Select({
  label,
  options,
  errorText,
  hint,
  id,
  className = '',
  disabled,
  ...rest
}: SelectProps) {
  const fieldId = id ?? `sel-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const border = errorText
    ? 'border-2 border-red-500'
    : 'border border-grey-300 focus:border-2 focus:border-blue-500';

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-label text-grey-700">
        {label}
      </label>
      <select
        id={fieldId}
        disabled={disabled}
        className={[
          'h-12 w-full rounded-sm bg-grey-0 px-3 text-body text-grey-900',
          'outline-none transition-[border] duration-instant ease-standard',
          'disabled:bg-grey-50 disabled:text-grey-400',
          border,
        ].join(' ')}
        aria-invalid={Boolean(errorText)}
        aria-describedby={errorText ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {errorText ? (
        <p id={`${fieldId}-err`} className="mt-1 text-body-small text-red-700">
          {errorText}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1 text-body-small text-grey-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
