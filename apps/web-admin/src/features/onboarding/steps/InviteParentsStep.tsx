import { forwardRef, useImperativeHandle, useState } from 'react';
import { Button, EmptyState, ErrorState, Skeleton } from '@saw/ui';
import { useInviteStatus, useOnboardingActions } from '../useOnboardingState';
import { InviteDeliveryNote } from './InviteDeliveryNote';

export type InviteStepHandle = {
  save: () => Promise<number>;
};

type Props = { schoolName: string };

export const InviteParentsStep = forwardRef<InviteStepHandle, Props>(
  function InviteParentsStep({ schoolName }, ref) {
    const statusQ = useInviteStatus();
    const { inviteParents } = useOnboardingActions();
    const [optIn, setOptIn] = useState(true);
    const [sent, setSent] = useState(0);
    const [busySection, setBusySection] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({ save: async () => sent }), [sent]);

    if (statusQ.isPending) return <Skeleton height={260} className="w-full" />;

    if (statusQ.isError) {
      return (
        <ErrorState
          message={
            statusQ.error instanceof Error
              ? statusQ.error.message
              : 'Could not load your parent list.'
          }
          onRetry={() => void statusQ.refetch()}
        />
      );
    }

    const parents = statusQ.data!.parents;

    if (parents.eligible === 0 && parents.invited === 0) {
      return (
        <EmptyState
          headline="No parents with an email yet"
          body="Import your students first — guardian emails come in with them — or skip and invite later."
        />
      );
    }

    async function send(sectionId?: string) {
      setError(null);
      setBusySection(sectionId ?? 'all');
      try {
        const res = await inviteParents.mutateAsync(
          sectionId ? { sectionIds: [sectionId] } : { all: true },
        );
        setSent((n) => n + res.invited);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not send the invitations.',
        );
      } finally {
        setBusySection(null);
      }
    }

    const sections = parents.sections.filter((s) => s.eligible > 0 || s.invited > 0);

    return (
      <div className="flex flex-col gap-5">
        <p className="text-body text-grey-900">
          {parents.eligible} parents have an email on file
        </p>

        <label className="flex items-start gap-2 text-body-small text-grey-900">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded-sm border-grey-300"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
          />
          Send an invitation by email
        </label>

        <div>
          <p className="text-body-small text-grey-600">Preview:</p>
          <p className="mt-1 rounded-md border border-grey-200 bg-grey-25 px-4 py-3 text-body-small text-grey-900">
            {schoolName} has invited you to School All Ways. Open the link in
            your email to set your password.
          </p>
          <p className="mt-2 text-body-small text-grey-600">
            Parents will be asked to add their child&rsquo;s address and photo.
          </p>
        </div>

        {error ? <ErrorState message={error} onRetry={() => setError(null)} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            loading={busySection === 'all'}
            disabled={!optIn || parents.eligible === 0 || Boolean(busySection)}
            onClick={() => void send()}
          >
            Send {parents.eligible} invitations
          </Button>
          {parents.invited > 0 ? (
            <span className="text-body-small text-grey-700">
              {parents.joined} of {parents.invited} have joined
            </span>
          ) : null}
        </div>

        <InviteDeliveryNote delivery={parents.delivery} />

        {sections.length > 0 ? (
          <section className="flex flex-col gap-2">
            <p className="text-body-small text-grey-600">
              Or start with one class — send section by section and go wider once
              you have seen how parents respond.
            </p>
            <ul className="divide-y divide-grey-200 rounded-md border border-grey-200 bg-grey-0">
              {sections.map((s) => (
                <li
                  key={s.sectionId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="text-body text-grey-900">
                    {s.label}
                    <span className="ml-2 text-body-small text-grey-600">
                      {s.invited > 0
                        ? `${s.joined} of ${s.invited} joined`
                        : `${s.eligible} with a number`}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="compact"
                    loading={busySection === s.sectionId}
                    disabled={!optIn || s.eligible === 0 || Boolean(busySection)}
                    onClick={() => void send(s.sectionId)}
                  >
                    {s.invited > 0 ? 'Send again' : `Send ${s.eligible}`}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  },
);
