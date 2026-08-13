import type { InputHTMLAttributes } from 'react';

import { formatSawDate } from '../format';

export interface DatePickerProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label: string;
  /** ISO `YYYY-MM-DD` or empty. */
  value?: string;
  onChange: (isoDate: string) => void;
  errorText?: string;
}

/**
 * Native date input with label above. Display string for read-only contexts
 * uses [formatSawDate] (`10 Aug 2026`).
 */
export function DatePicker({
  label,
  value = '',
  onChange,
  errorText,
  id,
  className = '',
  disabled,
  ...rest
}: DatePickerProps) {
  const fieldId = id ?? `date-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const border = errorText
    ? 'border-2 border-red-500'
    : 'border border-grey-300 focus:border-2 focus:border-blue-500';

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1.5 block text-label text-grey-700">
        {label}
      </label>
      <input
        id={fieldId}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'h-12 w-full rounded-sm bg-grey-0 px-3 text-body text-grey-900',
          'outline-none transition-[border] duration-instant ease-standard',
          'disabled:bg-grey-50 disabled:text-grey-400',
          border,
        ].join(' ')}
        aria-invalid={Boolean(errorText)}
        {...rest}
      />
      {value ? (
        <p className="mt-1 text-caption text-grey-500">{formatSawDate(value)}</p>
      ) : null}
      {errorText ? (
        <p className="mt-1 text-body-small text-red-700">{errorText}</p>
      ) : null}
    </div>
  );
}
