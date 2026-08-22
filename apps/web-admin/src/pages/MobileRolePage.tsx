import { Card, EmptyState } from '@saw/ui';
import { useAuth } from '../lib/auth';

/**
 * Landing for a role whose work happens in the mobile admin app.
 *
 * Sixteen of the twenty-six admin roles — every teacher, plus the cashier,
 * librarian, nurse, lab in-charge, store keeper, driver and security guard —
 * resolve no web-admin screen at all. Their tools (take attendance, gate
 * scanner, fee counter) are mobile-first by design and have no web equivalent.
 *
 * They used to land on the principal dashboard and get a permission error. A
 * generic "coming soon" would be equally wrong, because nothing is coming —
 * this is the intended shape of the product. So say that plainly and point them
 * where the work actually is.
 */
export function MobileRolePage() {
  const { session } = useAuth();
  const roleName = session?.roles?.[0]?.name ?? 'Your role';

  return (
    <div>
      <h1 className="text-h1 text-grey-900">{roleName}</h1>
      <p className="mt-2 text-body-small text-grey-600">
        {session?.tenant?.name}
      </p>

      <div className="mt-6">
        <EmptyState
          headline="Your work happens in the app"
          body="Attendance, homework, fee collection and gate duty are built for the phone — they are not part of the web console. Sign in to the School All Ways admin app with this same email and password."
        />
      </div>

      <Card className="mt-6">
        <div className="text-h3 text-grey-900">Need the web console?</div>
        <p className="mt-2 text-body-small text-grey-600">
          Ask your school administrator to grant an additional role if you need
          access to records, reports or settings on a computer.
        </p>
      </Card>
    </div>
  );
}
