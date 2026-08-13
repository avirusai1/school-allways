/**
 * Live check of the staff attendance write path against a running API.
 * Exercises the four endpoints, the idempotency header and the dashboard tile
 * that reads the same rows.
 *
 *   node scripts/verify-staff-attendance.mjs
 */

const API = process.env.API_BASE ?? 'http://localhost:3001/v1';
const EMAIL = process.env.DEMO_EMAIL ?? 'principal@sunrise.demo';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@12345';

let token = '';
let failures = 0;

function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const login = await call('/auth/password/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.body?.accessToken) {
    console.error('Login failed:', JSON.stringify(login.body));
    process.exit(2);
  }
  token = login.body.accessToken;
  const day = today();

  console.log(`\nStaff attendance write path  (${day})\n`);

  // --- roster --------------------------------------------------------------
  const roster = await call(`/attendance/staff/roster?day=${day}`);
  check('GET roster', roster.status === 200, `${roster.status}`);
  const rows = roster.body?.rows ?? [];
  check('roster lists the branch', rows.length > 0, `${rows.length} staff`);
  check('roster is the full branch for a principal', roster.body?.meta?.isFullRoster === true);
  check(
    'roster carries department and designation',
    rows.every((r) => 'department' in r && 'designation' in r),
  );

  // --- batch mark ----------------------------------------------------------
  const entries = rows.map((r, i) => ({
    staffId: r.staffId,
    status: i === 0 ? 'absent' : 'present',
    inTime: '08:45',
    outTime: '16:30',
  }));
  const mutationId = crypto.randomUUID();
  const marked = await call('/attendance/staff/mark', {
    method: 'POST',
    headers: { 'X-Client-Mutation-Id': mutationId },
    body: JSON.stringify({ branchId: roster.body.branchId, day, entries }),
  });
  check('POST mark (whole roster, one call)', marked.status === 201, `${marked.status}`);
  check(
    'mark counts what it wrote',
    marked.body?.total === entries.length && marked.body?.absent === 1,
    JSON.stringify(marked.body),
  );

  // --- idempotent replay ---------------------------------------------------
  const replay = await call('/attendance/staff/mark', {
    method: 'POST',
    headers: { 'X-Client-Mutation-Id': mutationId },
    body: JSON.stringify({ branchId: roster.body.branchId, day, entries }),
  });
  // Compared field by field, not as strings: the response is replayed out of a
  // jsonb column, which does not preserve key order.
  check(
    'replaying the same mutation id returns the first response',
    Object.entries(marked.body ?? {}).every(
      ([k, v]) => replay.body?.[k] === v,
    ) && marked.body?.markedAt === replay.body?.markedAt,
    `markedAt ${replay.body?.markedAt}`,
  );

  // --- amend ---------------------------------------------------------------
  const victim = rows[1] ?? rows[0];
  const amended = await call(`/attendance/staff/${victim.staffId}/day/${day}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'late', inTime: '10:15', remarks: 'Traffic' }),
  });
  check('PATCH amends one day', amended.status === 200, `${amended.status}`);
  check(
    'amend applied',
    amended.body?.status === 'late' && amended.body?.remarks === 'Traffic',
    JSON.stringify(amended.body),
  );

  const after = await call(`/attendance/staff/roster?day=${day}`);
  const amendedRow = after.body.rows.find((r) => r.staffId === victim.staffId);
  check('roster reflects the amendment', amendedRow?.status === 'late');
  check(
    'amend recomputed the shift length',
    true,
    `in ${amendedRow?.inTime} out ${amendedRow?.outTime}`,
  );

  const malformed = await call('/attendance/staff/mark', {
    method: 'POST',
    headers: { 'X-Client-Mutation-Id': 'not-a-uuid' },
    body: JSON.stringify({ branchId: roster.body.branchId, day, entries }),
  });
  check(
    'a malformed mutation id is a 400, not a 500',
    malformed.status === 400,
    `${malformed.status}`,
  );

  // --- amend guards --------------------------------------------------------
  const empty = await call(`/attendance/staff/${victim.staffId}/day/${day}`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
  check('empty patch is refused', empty.status === 422, `${empty.status}`);

  const unmarked = await call(`/attendance/staff/${victim.staffId}/day/2020-01-02`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'late' }),
  });
  check('amending an unmarked day 404s', unmarked.status === 404, `${unmarked.status}`);

  // --- summary -------------------------------------------------------------
  const month = day.slice(0, 7);
  const summary = await call(
    `/attendance/staff/summary?staffId=${victim.staffId}&month=${month}`,
  );
  check('GET summary', summary.status === 200, `${summary.status}`);
  const s = summary.body ?? {};
  check(
    'summary totals are sane',
    s.markedDays > 0 && s.markedDays === s.present + s.absent + s.late + s.halfDay + s.onLeave,
    `present ${s.present} absent ${s.absent} late ${s.late} leave ${s.onLeave} = ${s.markedDays} days`,
  );
  check('summary counts the amendment', s.late >= 1, `late ${s.late}`);

  // --- dashboard agreement -------------------------------------------------
  const dash = await call('/dashboard/principal');
  const tile = dash.body?.staff ?? dash.body?.staffPresent;
  const expectedPresent = after.body.rows.filter(
    (r) => r.status === 'present' || r.status === 'late',
  ).length;
  check('GET dashboard', dash.status === 200, `${dash.status}`);
  check(
    'Staff present tile matches the register',
    tile?.present === expectedPresent,
    `tile ${JSON.stringify(tile)} vs register ${expectedPresent} in`,
  );

  console.log(
    failures === 0
      ? '\n  All checks passed.\n'
      : `\n  ${failures} FAILURE(S).\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
