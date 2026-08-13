import { useEffect, useState } from 'react';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  /** Auto-dismiss ms. 0 = sticky. */
  durationMs?: number;
  onDismiss?: () => void;
}

const toneClass: Record<ToastTone, string> = {
  neutral: 'bg-grey-800 text-grey-0',
  success: 'bg-green-700 text-grey-0',
  danger: 'bg-red-700 text-grey-0',
};

/** Transient feedback only — never for errors the user must act on. */
export function Toast({
  message,
  tone = 'neutral',
  durationMs = 3200,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!durationMs) return;
    const t = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className={[
        'fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-md px-4 py-3 shadow-md',
        'text-body-small',
        toneClass[tone],
      ].join(' ')}
    >
      {message}
    </div>
  );
}
