#!/usr/bin/env node
/**
 * Timed walk through all nine onboarding steps against a fresh tenant,
 * issuing exactly the calls the wizard issues, in the same order.
 *
 *   pnpm db:seed:onboarding
 *   node scripts/e2e-onboarding.mjs --students 400
 *
 * Measures the system's contribution to build/16 §9's "signup → first
 * attendance under 30 minutes". It does not include human typing time.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = arg('base', 'http://127.0.0.1:3000/v1');
const EMAIL = arg('email', 'admin@onboarding.demo');
const PASSWORD = arg('password', 'Demo@12345');
const STUDENTS = Number(arg('students', '400'));
const STAFF = Number(arg('staff', '25'));
const LOG_PATH = arg('log', '/tmp/saw-api.log');

let token = '';
const timings = [];

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} → ${res.status} ${body?.error?.message ?? text}`,
    );
  }
  return body;
}

async function timed(label, fn) {
  const t0 = Date.now();
  const out = await fn();
  const ms = Date.now() - t0;
  timings.push({ label, ms });
  process.stdout.write(`  ${label.padEnd(34)} ${(ms / 1000).toFixed(1)}s\n`);
  return out;
}

const started = (step) =>
  api(`/onboarding/steps/${step}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'started' }),
  });

const completed = (step, data, itemCount, durationSeconds) =>
  api(`/onboarding/steps/${step}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'completed', durationSeconds, itemCount, data }),
  });

const FIRST = ['Aarav', 'Ananya', 'Vivaan', 'Diya', 'Aditya', 'Ishita', 'Arjun', 'Kavya',
  'Rohan', 'Meera', 'Karthik', 'Sneha', 'Rahul', 'Priya', 'Nikhil', 'Tara'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Verma', 'Gupta', 'Rao',
  'Menon', 'Desai', 'Joshi', 'Banerjee'];
const CLASS_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function studentCsv(n) {
  const lines = ['ADMISSION NO,NAME OF STUDENT,DOB,CLASS,SECTION,MOBILE'];
  for (let i = 0; i < n; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const cls = CLASS_NAMES[i % CLASS_NAMES.length];
    const dd = String((i % 28) + 1).padStart(2, '0');
    const mm = String((i % 12) + 1).padStart(2, '0');
    const yyyy = 2010 + (i % 8);
    const phone = `98${String(10000000 + i).slice(0, 8)}`;
    lines.push(
      `ADM${String(1000 + i)},${name},${dd}/${mm}/${yyyy},${cls},A,${phone}`,
    );
  }
  return lines.join('\n');
}

function staffCsv(n) {
  const lines = ['EMP CODE,NAME,MOBILE,EMAIL,DESIGNATION'];
  for (let i = 0; i < n; i++) {
    const name = `${FIRST[(i + 3) % FIRST.length]} ${LAST[(i + 5) % LAST.length]}`;
    const phone = `97${String(20000000 + i).slice(0, 8)}`;
    lines.push(
      `EMP${String(100 + i)},${name},${phone},staff${i}@onboarding.demo,Teacher`,
    );
  }
  return lines.join('\n');
}

/**
 * Sending an invitation and calling it done was the gap this step closes: until
 * something consumes a token, "N of M have joined" can only ever read zero.
 *
 * Tokens are hashed at rest, so the only place the raw value survives is the
 * message that actually went out. With the logging provider that is the API log
 * — which is the honest source for an end-to-end check, since it is literally
 * what a parent would have received. If the log is not readable the step
 * reports as skipped rather than failing the run.
 */
async function consumeInvites() {
  const { readFileSync } = await import('node:fs');

  let log = '';
  try {
    log = readFileSync(LOG_PATH, 'utf8');
  } catch {
    return { skipped: `no provider log at ${LOG_PATH}` };
  }

  const linkFor = (templateCode) => {
    const re = new RegExp(`\\(${templateCode}\\):[^\\n]*?(https?://\\S+/join/(\\S+?))(?:\\s|$)`, 'g');
    const hits = [...log.matchAll(re)];
    return hits.length ? hits[hits.length - 1] : null;
  };

  // A run started after 21:00 IST writes the ledger rows but schedules the send
  // for 07:00, so there is genuinely no message to read back yet. That is quiet
  // hours working, not a broken link — and it looks identical to a stalled
  // worker unless the script says which one it is.
  if (!/Notify job /.test(log)) {
    return {
      skipped:
        'nothing dispatched yet — quiet hours defer the send. Re-run outside ' +
        'the COMMS_QUIET_HOURS_START/END window, or start the API with a ' +
        'narrower one, to exercise the join path',
    };
  }

  const out = {};
  for (const [label, code] of [
    ['staff', 'STAFF_INVITE'],
    ['parent', 'PARENT_PROFILE_INVITE'],
  ]) {
    const hit = linkFor(code);
    if (!hit) {
      out[label] = { error: 'no link found in the provider log' };
      continue;
    }

    const [, url, token] = hit;
    const first = await api(`/auth/join/${token}`, { method: 'POST' });
    // Tapping the same link twice is normal; it must not read as an error.
    const second = await api(`/auth/join/${token}`, { method: 'POST' });

    out[label] = {
      url,
      status: first.status,
      replay: second.status,
      gotSession: Boolean(first.auth?.accessToken),
      students: first.students?.length ?? 0,
      staffName: first.staff?.name ?? null,
    };
  }

  return out;
}

async function runImport(entity, csv, branchId, fieldMap) {
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), `${entity}.csv`);
  form.append('branchId', branchId);
  form.append('entity', entity);
  form.append('vendor', 'generic');

  const up = await api('/import/upload', { method: 'POST', body: form });

  const mapping = {};
  for (const col of up.detectedColumns) {
    mapping[col] = fieldMap[col.toUpperCase()] ?? 'skip';
  }
  await api(`/import/${up.importId}/map`, {
    method: 'POST',
    body: JSON.stringify({ mapping, vendor: 'generic' }),
  });

  const validation = await api(`/import/${up.importId}/validate`, { method: 'POST' });
  await api(`/import/${up.importId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ partialCommit: true }),
  });

  // The UI polls every 1.5s; so do we, so the number is comparable.
  let status;
  for (let i = 0; i < 400; i++) {
    status = await api(`/import/${up.importId}/status`);
    if (status.status === 'committed' || status.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (status.status !== 'committed') {
    throw new Error(`Import ${entity} ended as ${status.status}`);
  }
  return { validation, status };
}

async function main() {
  process.stdout.write(
    `\nOnboarding end-to-end · ${STUDENTS} students, ${STAFF} staff\n\n`,
  );
  const wall = Date.now();

  const login = await timed('login', () =>
    api('/auth/password/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }),
  );
  token = login.accessToken ?? login.tokens?.accessToken;
  const session = await api('/auth/session');
  const branchId = session.branch.id;

  if (session.tenant.onboardingCompletedAt) {
    throw new Error(
      'Tenant is already onboarded. Run `pnpm db:seed:onboarding` for a fresh one.',
    );
  }

  // ---- Step 1 ------------------------------------------------------------
  await timed('1 school profile', async () => {
    await started('school_profile');
    await completed(
      'school_profile',
      {
        name: 'Onboarding Test School',
        board: 'cbse',
        udiseCode: '29010100101',
        address: '9 Residency Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560025',
        phone: '918040001234',
        email: 'office@onboarding.demo',
      },
      1,
      45,
    );
  });

  // ---- Step 2 ------------------------------------------------------------
  const year = new Date().getFullYear();
  await timed('2 academic session', async () => {
    await started('academic_session');
    await completed(
      'academic_session',
      {
        name: `${year}-${String(year + 1).slice(-2)}`,
        startDate: `${year}-04-01`,
        endDate: `${year + 1}-03-31`,
        termStructure: '3_terms',
        addNationalHolidays: true,
      },
      1,
      30,
    );
  });

  const sessions = await api(`/academic/sessions?branchId=${branchId}`);
  const academicSessionId = (sessions.find((s) => s.isCurrent) ?? sessions[0]).id;

  // ---- Step 3 ------------------------------------------------------------
  const classCount = await timed('3 classes (template + save)', async () => {
    await started('classes');
    await api('/academic/templates/apply', {
      method: 'POST',
      body: JSON.stringify({
        branchId,
        board: 'cbse',
        academicSessionId,
        include: ['classes'],
      }),
    });
    const classes = await api(`/academic/classes?branchId=${branchId}`);
    await api('/academic/classes/batch', {
      method: 'POST',
      body: JSON.stringify({
        branchId,
        academicSessionId,
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level,
          stage: c.stage ?? undefined,
          sections: [{ name: 'A', capacity: 45 }],
        })),
      }),
    });
    await completed('classes', { board: 'cbse' }, classes.length, 90);
    return classes.length;
  });

  // ---- Step 4 ------------------------------------------------------------
  const subjectCount = await timed('4 subjects (template + save)', async () => {
    await started('subjects');
    await api('/academic/templates/apply', {
      method: 'POST',
      body: JSON.stringify({
        branchId,
        board: 'cbse',
        academicSessionId,
        include: ['subjects'],
      }),
    });
    const classes = await api(`/academic/classes?branchId=${branchId}`);
    const subjects = await api(`/academic/subjects?branchId=${branchId}`);
    await api('/academic/subjects/batch', {
      method: 'POST',
      body: JSON.stringify({
        branchId,
        academicSessionId,
        subjects: subjects.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          type: s.type,
          isScholastic: s.isScholastic,
          classIds: classes.map((c) => c.id),
        })),
      }),
    });
    await completed('subjects', { board: 'cbse' }, subjects.length, 60);
    return subjects.length;
  });

  // ---- Step 5 ------------------------------------------------------------
  const staffResult = await timed(`5 import ${STAFF} staff`, async () => {
    await started('import_staff');
    const r = await runImport('staff', staffCsv(STAFF), branchId, {
      'EMP CODE': 'employeeCode',
      NAME: 'firstName',
      MOBILE: 'phone',
      EMAIL: 'workEmail',
      DESIGNATION: 'designation',
    });
    await completed(
      'import_staff',
      { itemCount: r.status.committedRows },
      r.status.committedRows,
      120,
    );
    return r;
  });

  // ---- Step 6 ------------------------------------------------------------
  const studentResult = await timed(`6 import ${STUDENTS} students`, async () => {
    await started('import_students');
    const r = await runImport('students', studentCsv(STUDENTS), branchId, {
      'ADMISSION NO': 'admissionNo',
      'NAME OF STUDENT': 'firstName',
      DOB: 'dateOfBirth',
      CLASS: 'className',
      SECTION: 'sectionName',
      MOBILE: 'phone',
    });
    await completed(
      'import_students',
      { itemCount: r.status.committedRows },
      r.status.committedRows,
      300,
    );
    return r;
  });

  // ---- Step 7 ------------------------------------------------------------
  const staffInvites = await timed('7 invite staff', async () => {
    await started('invite_staff');
    const before = await api('/onboarding/invite/status');
    const res = await api('/onboarding/invite/staff', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    });
    await completed('invite_staff', { itemCount: res.invited }, res.invited, 40);
    return {
      eligible: before.staff.eligible,
      invited: res.invited,
      joinedBefore: before.staff.joined,
    };
  });

  // ---- Step 8 ------------------------------------------------------------
  const parentInvites = await timed('8 invite parents', async () => {
    await started('invite_parents');
    const before = await api('/onboarding/invite/status');
    const res = await api('/onboarding/invite/parents', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    });
    await completed('invite_parents', { itemCount: res.invited }, res.invited, 50);
    return {
      eligible: before.parents.eligible,
      sections: before.parents.sections.length,
      invited: res.invited,
      joinedBefore: before.parents.joined,
    };
  });

  if (args.includes('--stop-before-attendance')) {
    process.stdout.write('\n  Stopped before step 9 — finish it in the browser.\n\n');
    return;
  }

  // ---- Step 9 ------------------------------------------------------------
  const attendance = await timed('9 first attendance', async () => {
    await started('first_attendance');
    const sections = await api(
      `/academic/sections?branchId=${branchId}&academicSessionId=${academicSessionId}`,
    );
    const target = sections.find((s) => s.studentCount > 0) ?? sections[0];
    const roster = await api(
      `/attendance/roster?sectionId=${target.id}&day=${new Date().toISOString().slice(0, 10)}`,
    );
    const marked = await api('/attendance/registers', {
      method: 'POST',
      body: JSON.stringify({
        sectionId: target.id,
        academicSessionId: roster.register.academicSessionId,
        day: roster.register.day,
        mode: 'daily',
        force: true,
        entries: roster.students.map((s, i) => ({
          studentId: s.studentId,
          status: i % 12 === 0 ? 'absent' : 'present',
        })),
      }),
    });
    await completed('first_attendance', { itemCount: marked.totalCount }, marked.totalCount, 60);
    return marked;
  });

  // ---- Step 10: the other end of the link --------------------------------
  const joins = await timed('10 consume invitation links', () => consumeInvites());

  const state = await api('/onboarding/state');
  const after = await api('/onboarding/invite/status');
  const totalMs = Date.now() - wall;

  const joinLine = (label, r, before, nowJoined) => {
    if (!r) return `  ${label.padEnd(26)} not attempted`;
    if (r.error) return `  ${label.padEnd(26)} ${r.error}`;
    return (
      `  ${label.padEnd(26)} ${r.status}` +
      `${r.gotSession ? ' + session' : ' WITHOUT SESSION'}` +
      `, replay: ${r.replay}` +
      `, joined ${before} -> ${nowJoined}`
    );
  };

  process.stdout.write(`
Result
  classes created            ${classCount}
  subjects created           ${subjectCount}
  staff committed            ${staffResult.status.committedRows} of ${staffResult.validation.totalRows}
  students committed         ${studentResult.status.committedRows} of ${studentResult.validation.totalRows}
  staff invited              ${staffInvites.invited} of ${staffInvites.eligible} eligible
  parents invited            ${parentInvites.invited} of ${parentInvites.eligible} eligible (${parentInvites.sections} sections)
  attendance                 ${attendance.sectionLabel} · ${attendance.presentCount} present, ${attendance.absentCount} absent
${
  joins.skipped
    ? `  join links                 skipped (${joins.skipped})`
    : [
        joinLine('staff join', joins.staff, staffInvites.joinedBefore, after.staff.joined),
        joinLine('parent join', joins.parent, parentInvites.joinedBefore, after.parents.joined),
      ].join('\n')
}
  activatedAt                ${state.activatedAt ?? 'NOT SET'}
  onboardingCompletedAt      ${state.onboardingCompletedAt ?? 'NOT SET'}
  progress                   ${state.progressPercent}%

  TOTAL                      ${(totalMs / 1000).toFixed(1)}s (${(totalMs / 60000).toFixed(1)} min)

`);

  if (!state.activatedAt) process.exitCode = 1;
  if (!state.onboardingCompletedAt) process.exitCode = 1;
  // The whole point of step 10: a link that leads nowhere leaves this at zero.
  if (!joins.skipped && (after.staff.joined === 0 || after.parents.joined === 0)) {
    process.stderr.write('  Joined counts did not move off zero.\n\n');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`\nFailed: ${err.message}\n\n`);
  process.exit(1);
});
