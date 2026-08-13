import type { InviteDelivery } from '../useOnboardingState';

/**
 * "Sent" and "issued an invitation" are different claims, and the wizard used
 * to only be able to make the second one while sounding like the first. This
 * reports what the delivery ledger actually says, including the failures.
 */
export function InviteDeliveryNote({ delivery }: { delivery: InviteDelivery }) {
  const { sent, failed, pending } = delivery;
  if (sent === 0 && failed === 0 && pending === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-small">
      {sent > 0 ? (
        <span className="text-grey-700">{sent} delivered</span>
      ) : null}
      {pending > 0 ? (
        <span className="text-grey-600">{pending} still sending</span>
      ) : null}
      {failed > 0 ? (
        <span className="text-red-600">
          {failed} could not be delivered — check the mobile numbers on file
        </span>
      ) : null}
    </div>
  );
}
