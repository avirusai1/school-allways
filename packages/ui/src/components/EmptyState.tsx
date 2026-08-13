import type { ReactNode } from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  headline: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Icon + headline + one sentence + one Outline action. No illustrations. */
export function EmptyState({
  icon,
  headline,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-6 text-center">
      {icon ? <div className="text-grey-300 [&_svg]:h-8 [&_svg]:w-8">{icon}</div> : null}
      <h3 className={`${icon ? 'mt-4' : ''} text-h3 text-grey-900`}>{headline}</h3>
      <p className="mt-2 max-w-sm text-body-small text-grey-500">{body}</p>
      {actionLabel && onAction ? (
        <div className="mt-5">
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
