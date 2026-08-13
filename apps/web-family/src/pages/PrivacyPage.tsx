import { EmptyState } from '@saw/ui';

export function PrivacyPage() {
  return (
    <div>
      <h1 className="text-h1 text-grey-900">Privacy</h1>
      <div className="mt-6 space-y-4 text-body-small text-grey-700">
        <p>
          Under India&apos;s DPDP Act, children under 18 are treated as children. We do not use
          behavioural tracking, analytics SDKs, or advertising SDKs on this portal.
        </p>
        <EmptyState
          headline="Your data stays at your school"
          body="Platform operators cannot open student records from the control console. Ask the school office for export or deletion requests."
        />
      </div>
    </div>
  );
}
