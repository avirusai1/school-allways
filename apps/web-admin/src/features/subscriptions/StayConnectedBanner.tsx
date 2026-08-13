import { useState } from 'react';
import { formatIndianMoney } from '@saw/ui';
import { useAuth } from '../../lib/auth';
import { useStayConnected } from './useSubscriptions';

/**
 * Stay Connected Fee reminder. Dismissible, never blocks. Only for holders of
 * tenant.settings.manage (school admin / principal). Teachers and parents never see it.
 */
export function StayConnectedBanner() {
  const { hasPermission } = useAuth();
  const canSee = hasPermission('tenant.settings.manage');
  const [dismissed, setDismissed] = useState(false);
  const query = useStayConnected(canSee);

  if (!canSee) return null;
  if (dismissed) return null;
  if (!query.data?.fee || query.data.fee.status !== 'pending') return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-body-small text-amber-950">
        Stay Connected Fee of {formatIndianMoney(query.data.fee.totalPaise, false)} (₹500 + GST) is
        pending for {query.data.sessionName ?? 'this session'}. Nothing is blocked — this is a
        reminder only.
      </p>
      <button
        type="button"
        className="shrink-0 text-[12px] font-medium text-amber-800 hover:underline"
        onClick={() => setDismissed(true)}
      >
        Dismiss
      </button>
    </div>
  );
}
