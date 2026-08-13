/**
 * Reads the database directly after `node scripts/e2e-onboarding.mjs` to check
 * the two things the API response cannot prove on its own:
 *
 *   1. Importing staff and students provisions real logins — `users` rows plus
 *      an `invited` membership — because an invitation is addressed to an
 *      account, and B4 shipped with imports that created neither.
 *   2. Sending those invitations writes real rows to the delivery ledger,
 *      rather than reporting a send nothing attempted.
 *
 *   pnpm db:seed:onboarding
 *   node scripts/e2e-onboarding.mjs --base http://127.0.0.1:3001/v1
 *   pnpm --filter @saw/db verify:onboarding
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set.');

const SLUG = process.env.ONBOARDING_SLUG ?? 'saw-onboarding-test';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}\n`);
}

async function main() {
  const sql = postgres(DATABASE_URL!, { max: 1 });

  const [tenant] = await sql<{ id: string }[]>`
    select id from tenants where slug = ${SLUG}`;
  if (!tenant) {
    process.stderr.write(`\n  No tenant '${SLUG}'. Run pnpm db:seed:onboarding first.\n\n`);
    process.exit(2);
  }
  const t = tenant.id;

  process.stdout.write(`\nOnboarding run, database side  (${SLUG})\n\n  Staff accounts\n`);

  // An imported "Mobile" column lands in personal_phone, not work_phone: the
  // schema treats the personal number as never exposed to parents, and a
  // number of unknown provenance is safer there.
  const [staffRows] = await sql<{ total: number; linked: number; phoned: number }[]>`
    select count(*)::int as total,
           count(*) filter (where user_id is not null)::int as linked,
           count(*) filter (where coalesce(work_phone, personal_phone) is not null)::int as phoned
    from staff where tenant_id = ${t}`;
  check(
    'staff imported',
    staffRows!.total > 0,
    `${staffRows!.total} rows, ${staffRows!.phoned} with a phone`,
  );
  check(
    'every staff member with a phone got a login',
    staffRows!.linked === staffRows!.phoned,
    `${staffRows!.linked} linked to a user`,
  );

  const [staffUsers] = await sql<{ n: number; kind: number; phoned: number }[]>`
    select count(*)::int as n,
           count(*) filter (where u.kind = 'staff')::int as kind,
           count(*) filter (where u.phone is not null)::int as phoned
    from staff s join users u on u.id = s.user_id
    where s.tenant_id = ${t}`;
  check('their users rows exist', staffUsers!.n === staffRows!.linked, `${staffUsers!.n} users`);
  check('marked kind = staff', staffUsers!.kind === staffUsers!.n);
  check('carry the phone the invite is sent to', staffUsers!.phoned === staffUsers!.n);

  // `active` is now a legitimate outcome, not drift: consuming a join token
  // flips the membership. What would be wrong is any other state.
  const [staffMemberships] = await sql<{ n: number; reachable: number; active: number }[]>`
    select count(*)::int as n,
           count(*) filter (where m.status in ('invited', 'active'))::int as reachable,
           count(*) filter (where m.status = 'active')::int as active
    from staff s
    join user_tenant_memberships m
      on m.user_id = s.user_id and m.tenant_id = s.tenant_id
    where s.tenant_id = ${t}`;
  check(
    'each has a membership in this tenant',
    staffMemberships!.n === staffRows!.linked,
    `${staffMemberships!.n} memberships`,
  );
  check(
    'all invited or joined, none in a dead state',
    staffMemberships!.reachable === staffMemberships!.n,
    `${staffMemberships!.n - staffMemberships!.active} invited, ${staffMemberships!.active} joined`,
  );

  process.stdout.write('\n  Guardian accounts\n');

  const [guardianRows] = await sql<{ total: number; linked: number; phoned: number }[]>`
    select count(*)::int as total,
           count(*) filter (where user_id is not null)::int as linked,
           count(*) filter (where phone is not null)::int as phoned
    from guardians where tenant_id = ${t}`;
  check(
    'guardians imported',
    guardianRows!.total > 0,
    `${guardianRows!.total} rows, ${guardianRows!.phoned} with a phone`,
  );
  check(
    'every guardian with a phone got a login',
    guardianRows!.linked === guardianRows!.phoned,
    `${guardianRows!.linked} linked to a user`,
  );

  const [guardianMemberships] = await sql<
    { n: number; reachable: number; active: number; kind: number }[]
  >`
    select count(*)::int as n,
           count(*) filter (where m.status in ('invited', 'active'))::int as reachable,
           count(*) filter (where m.status = 'active')::int as active,
           count(*) filter (where u.kind = 'guardian')::int as kind
    from guardians g
    join users u on u.id = g.user_id
    join user_tenant_memberships m
      on m.user_id = g.user_id and m.tenant_id = g.tenant_id
    where g.tenant_id = ${t}`;
  check(
    'each has a membership, invited or joined',
    guardianMemberships!.n === guardianRows!.linked &&
      guardianMemberships!.reachable === guardianMemberships!.n,
    `${guardianMemberships!.n - guardianMemberships!.active} invited, ` +
      `${guardianMemberships!.active} joined`,
  );
  check('marked kind = guardian', guardianMemberships!.kind === guardianMemberships!.n);

  process.stdout.write('\n  Delivery ledger\n');

  const ledger = await sql<
    { template_code: string; channel: string; status: string; n: number }[]
  >`
    select template_code, channel, status, count(*)::int as n
    from delivery_attempts where tenant_id = ${t}
    group by template_code, channel, status
    order by template_code, channel, status`;

  for (const r of ledger) {
    process.stdout.write(
      `        ${r.template_code.padEnd(22)} ${r.channel.padEnd(9)} ${r.status.padEnd(10)} ${r.n}\n`,
    );
  }

  const paid = ledger.filter((r) => r.channel !== 'in_app');
  const staffSent = paid
    .filter((r) => r.template_code === 'STAFF_INVITE' && r.status === 'sent')
    .reduce((n, r) => n + r.n, 0);
  const parentSent = paid
    .filter((r) => r.template_code === 'PARENT_PROFILE_INVITE' && r.status === 'sent')
    .reduce((n, r) => n + r.n, 0);

  check('ledger has rows at all', ledger.length > 0, `${ledger.length} groups`);
  check('staff invites actually attempted a send', staffSent > 0, `${staffSent} sent`);
  check('parent invites actually attempted a send', parentSent > 0, `${parentSent} sent`);
  check(
    'nothing stuck queued',
    paid.filter((r) => r.status === 'queued').reduce((n, r) => n + r.n, 0) === 0,
  );

  process.stdout.write('\n  Role integrity\n');

  // Until D2 the seed inserted a fresh copy of every system role on each run,
  // because a unique index on (tenant_id, code) does not constrain rows whose
  // tenant_id is NULL. Assignments then pointed at whichever copy existed when
  // the user was created, so a role could be carrying a permission set from
  // weeks earlier. Nothing static can catch this — it only exists in the data.
  const dupes = await sql<{ code: string; n: number }[]>`
    select code, count(*)::int as n from roles
    where tenant_id is null group by code having count(*) > 1`;
  check(
    'no duplicate system roles',
    dupes.length === 0,
    dupes.map((d) => `${d.code}×${d.n}`).join(' '),
  );

  const stale = await sql<{ code: string; n: number }[]>`
    select r.code, count(distinct a.role_id)::int as n
    from user_role_assignments a
    join roles r on r.id = a.role_id
    where a.tenant_id = ${t}
    group by r.code having count(distinct a.role_id) > 1`;
  check(
    'every assignment in this tenant points at one role row per code',
    stale.length === 0,
    stale.map((s) => `${s.code}→${s.n} rows`).join(' '),
  );

  process.stdout.write('\n  Join links consumed\n');

  // An invitation nobody can act on is the same as an invitation never sent, so
  // this section checks the far end of the link rather than the send.
  const consumed = await sql<{ purpose: string; n: number }[]>`
    select purpose, count(*)::int as n
    from join_tokens
    where tenant_id = ${t} and consumed_at is not null
    group by purpose order by purpose`;
  check(
    'both invitation kinds were actually consumed',
    consumed.length === 2,
    consumed.map((c) => `${c.purpose}×${c.n}`).join(' ') || 'none',
  );

  const [flipped] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from user_tenant_memberships m
    where m.tenant_id = ${t} and m.status = 'active'
      and exists (
        select 1 from join_tokens jt
        where jt.user_id = m.user_id and jt.consumed_at is not null
      )`;
  check(
    'every consumed token left an active membership behind',
    flipped!.n === consumed.reduce((a, c) => a + c.n, 0),
    `${flipped!.n} active`,
  );

  const [audited] = await sql<{ n: number }[]>`
    select count(*)::int as n from audit_logs
    where tenant_id = ${t} and action like 'auth.join.%'`;
  check('activation written to the audit trail', audited!.n > 0, `${audited!.n} rows`);

  // The bug this round found: a guardian could activate into a session with no
  // role, no permissions and no home screen.
  const [orphanParents] = await sql<{ n: number }[]>`
    select count(*)::int as n
    from guardians g
    where g.tenant_id = ${t} and g.user_id is not null
      and not exists (
        select 1 from user_role_assignments a
        where a.tenant_id = ${t} and a.user_id = g.user_id
      )`;
  check(
    'every guardian account can actually use the app',
    orphanParents!.n === 0,
    `${orphanParents!.n} with no role`,
  );

  process.stdout.write('\n  Telemetry\n');

  const events = await sql<{ step: string; action: string; n: number }[]>`
    select step, action, count(*)::int as n
    from onboarding_events where tenant_id = ${t}
    group by step, action order by step, action`;
  const started = events.filter((e) => e.action === 'started');
  const completed = events.filter((e) => e.action === 'completed');
  const doubled = events.filter((e) => e.n > 1);
  check('nine steps started', started.length === 9, `${started.length}`);
  check('nine steps completed', completed.length === 9, `${completed.length}`);
  check(
    'no step double-counted',
    doubled.length === 0,
    doubled.map((d) => `${d.step}.${d.action}×${d.n}`).join(' '),
  );
  check(
    'activation recorded once, separately from completion',
    events.filter((e) => e.action === 'activated').length === 1,
  );

  await sql.end();

  process.stdout.write(
    failures === 0 ? '\n  All checks passed.\n\n' : `\n  ${failures} FAILURE(S).\n\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
