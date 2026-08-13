import { Chip, formatIndianMoney, formatSawDate } from '@saw/ui';
import type { FamilyChild } from '../lib/use-selected-child';

type Props = {
  children: FamilyChild[];
  highlightId?: string | null;
};

/**
 * Parent paywall. Must never mention cash, school office payment, or any
 * method other than the (forthcoming) Play Billing flow. Google's Payments
 * policy forbids steering users to an alternate payment method inside the app.
 */
export function PaywallScreen({ children, highlightId }: Props) {
  const locked = children.filter((c) => c.status === 'locked' || c.subscribed === false);
  const focus = locked.find((c) => c.id === highlightId) ?? locked[0];

  return (
    <section className="rounded-md border border-grey-200 bg-grey-0 p-5">
      <h2 className="text-h2 text-grey-900">Unlock the full parent app</h2>
      <p className="mt-2 text-body-small text-grey-600">
        ₹1 per day per student — {formatIndianMoney(36500, false)} a year, GST included.
      </p>

      {children.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {children.map((c) => {
            const open = c.subscribed !== false && c.status !== 'locked';
            return (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-grey-900">{c.fullName}</span>
                {open ? (
                  <Chip
                    label={
                      c.expiresAt
                        ? `Active until ${formatSawDate(c.expiresAt)}`
                        : c.status === 'grace'
                          ? 'Included in school trial'
                          : 'Active'
                    }
                    tone="success"
                  />
                ) : (
                  <Chip label="Locked" tone="danger" />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {focus ? (
        <p className="mt-4 text-body-small text-grey-700">
          {focus.firstName} is locked for this session. Subscribe to unlock homework, results,
          fees, leave, the diary, books and bus tracking. Today&apos;s attendance stays visible
          either way.
        </p>
      ) : null}

      <ul className="mt-4 list-disc space-y-1 pl-5 text-body-small text-grey-700">
        <li>Homework, diary and notices</li>
        <li>Results and report cards</li>
        <li>Fees, leave requests, books and bus</li>
      </ul>

      {/* TODO(Phase 2): Google Play Billing purchase button. Do not add a web
          checkout or any non-Play payment control here. */}
      <p className="mt-5 rounded-md bg-grey-50 px-3 py-2 text-body-small text-grey-600">
        Payment opens in the mobile app (coming soon).
      </p>
    </section>
  );
}
