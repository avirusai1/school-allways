import { forwardRef, useImperativeHandle, useState } from 'react';
import { Button, EmptyState, ErrorState, Skeleton } from '@saw/ui';
import { useInviteStatus, useOnboardingActions } from '../useOnboardingState';
import { InviteDeliveryNote } from './InviteDeliveryNote';

export type InviteStepHandle = {
  /** Invitations sent in this session, for the step's `completed` telemetry. */
  save: () => Promise<number>;
};

type Props = { schoolName: string };

export const InviteStaffStep = forwardRef<InviteStepHandle, Props>(
  function InviteStaffStep({ schoolName }, ref) {
    const statusQ = useInviteStatus();
    const { inviteStaff } = useOnboardingActions();
    const [optIn, setOptIn] = useState(true);
    const [sent, setSent] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ save: async () => sent }), [sent]);

    if (statusQ.isPending) return <Skeleton height={220} className="w-full" />;

    if (statusQ.isError) {
      return (
        <ErrorState
          message={
            statusQ.error instanceof Error
              ? statusQ.error.message
              : 'Could not load your staff list.'
          }
          onRetry={() => void statusQ.refetch()}
        />
      );
    }

    const staff = statusQ.data!.staff;

    if (staff.eligible === 0 && staff.invited === 0) {
      return staff.withoutAccounts > 0 ? (
        <EmptyState
          headline={`${staff.withoutAccounts} staff are on file, but none have a login yet`}
          body="Invitations go to staff accounts. Give them accounts and roles from Staff, then send invitations from there — skip this step for now."
        />
      ) : (
        <EmptyState
          headline="No staff with a mobile number yet"
          body="Import your staff first, or skip this step and invite them later from Staff."
        />
      );
    }

    async function send() {
      setError(null);
      try {
        const res = await inviteStaff.mutateAsync({ all: true });
        setSent(res.invited);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not send the invitations.',
        );
      }
    }

    return (
      <div className="flex flex-col gap-5">
        <p className="text-body text-grey-900">
          {staff.eligible} staff have a mobile number on file
        </p>

        <label className="flex items-start gap-2 text-body-small text-grey-900">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded-sm border-grey-300"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
          />
          Send an invitation by SMS
        </label>

        <div>
          <p className="text-body-small text-grey-600">Preview:</p>
          <p className="mt-1 rounded-md border border-grey-200 bg-grey-25 px-4 py-3 text-body-small text-grey-900">
            {schoolName} has invited you to School All Ways. Tap to set up your
            account: saw.link/j/a4f2
          </p>
        </div>

        {error ? <ErrorState message={error} onRetry={() => setError(null)} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            loading={inviteStaff.isPending}
            disabled={!optIn || staff.eligible === 0}
            onClick={() => void send()}
          >
            Send {staff.eligible} invitations
          </Button>
          {staff.invited > 0 ? (
            <span className="text-body-small text-grey-700">
              {staff.joined} of {staff.invited} have joined
            </span>
          ) : (
            <span className="text-body-small text-grey-600">
              You can also do this later from Staff.
            </span>
          )}
        </div>

        <InviteDeliveryNote delivery={staff.delivery} />
      </div>
    );
  },
);
