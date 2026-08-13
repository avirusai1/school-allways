import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Inline error banner — red/50 fill, 3px red left border.
 * Never a toast for an error the user must act on.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={[
        'flex items-center gap-3 rounded-sm border-l-[3px] border-red-500 bg-red-50 px-3 py-3',
        className,
      ].join(' ')}
    >
      <p className="min-w-0 flex-1 text-body-small text-red-700">{message}</p>
      {onRetry ? (
        <Button variant="ghost" size="inline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
