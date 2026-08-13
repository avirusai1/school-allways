import type { ReactNode } from 'react';
import { useEffect } from 'react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Bottom sheet — radius/lg on top corners, shadow/md. Use for ≤6 fields. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-grey-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 w-full max-w-lg rounded-t-lg border border-grey-200 bg-grey-0 p-4 shadow-md"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-grey-200" aria-hidden />
        {title ? <h2 className="mb-4 text-h2 text-grey-900">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
