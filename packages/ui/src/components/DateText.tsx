import { formatSawDate } from '../format';

export { formatSawDate } from '../format';

export function DateText({
  value,
  className = '',
}: {
  value: string | Date | number;
  className?: string;
}) {
  return (
    <time
      dateTime={typeof value === 'string' ? value : undefined}
      className={`text-body text-grey-900 ${className}`}
    >
      {formatSawDate(value)}
    </time>
  );
}
