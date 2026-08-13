import type { ReactNode } from 'react';
import { useEffect } from 'react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** Accessible description. */
  description?: string;
}

/** Modal dialog — shadow/md, radius lg, focus trap deferred to consumer for now. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  description,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-grey-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="saw-dialog-title"
        aria-describedby={description ? 'saw-dialog-desc' : undefined}
        className="relative z-10 w-full max-w-md rounded-lg border border-grey-200 bg-grey-0 p-4 shadow-md"
      >
        <h2 id="saw-dialog-title" className="text-h2 text-grey-900">
          {title}
        </h2>
        {description ? (
          <p id="saw-dialog-desc" className="mt-2 text-body-small text-grey-500">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}
