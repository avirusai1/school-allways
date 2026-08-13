/**
 * Static verification of the seed catalogues. Runs WITHOUT a database, so it
 * belongs in CI on every push — it is the cheapest guard we have against the
 * two failure modes that matter:
 *
 *   1. A restricted permission (counselling notes, safe reports) leaking into
 *      a role through a wildcard like `student.*`.
 *   2. A role's scope resolving wider than intended, which is how one teacher
 *      ends up reading the whole school.
 *
 *   pnpm --filter @saw/db verify
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERMISSIONS, assertNoDuplicates } from './permissions';
import { SYSTEM_ROLES, resolvePermissionCodes, resolveScope, type ScopeType } from './roles';
import { CONSENT_PURPOSES, PLANS } from './catalogues';
import { NOTIFICATION_TEMPLATES } from './notification-templates';

const ALL_CODES = PERMISSIONS.map((p) => p.code);
const BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));
const RESTRICTED = new Set(
  PERMISSIONS.filter((p) => p.sensitivity === 'restricted').map((p) => p.code),
);

/** The ONLY roles permitted to hold a `restricted` permission. */
const RESTRICTED_HOLDERS = ['special_educator', 'platform_super_admin'];

type Failure = { kind: string; detail: string };
const failures: Failure[] = [];

function fail(kind: string, detail: string) {
  failures.push({ kind, detail });
}

/**
 * A notify() call naming a template that was never seeded does not raise
 * anything a caller can see — the message is simply never delivered, and the
 * sender is told it was queued. That is exactly how every invitation and
 * absence alert in the product came to be silently dropped, so the API source
 * is scanned here and any code without a template fails the build.
 */
function verifyNotificationTemplates() {
  const seeded = new Set(NOTIFICATION_TEMPLATES.map((t) => t.code));
  const apiSrc = join(dirname(fileURLToPath(import.meta.url)), '../../apps/api/src');

  let referenced: Map<string, string>;
  try {
    referenced = scanTemplateCodes(apiSrc);
  } catch {
    // Running outside the monorepo checkout — nothing to cross-check.
    process.stdout.write('\n  Notification templates: API source not found, skipped\n');
    return;
  }

  process.stdout.write('\n  Notification templates\n');
  for (const [code, where] of [...referenced].sort()) {
    const ok = seeded.has(code);
    if (!ok) {
      fail(
        'notification-template',
        `${code} is sent by ${where} but has no seeded template — the message would ` +
          'be accepted and never delivered',
      );
    }
    process.stdout.write(`    ${ok ? 'PASS' : 'FAIL'}  ${code}\n`);
  }
}

function scanTemplateCodes(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /templateCode:\s*'([A-Z0-9_]+)'/g;

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      // Specs name codes that need no template; they assert on the call, not
      // on delivery.
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;
      const source = readFileSync(full, 'utf8');
      for (const match of source.matchAll(pattern)) {
        if (!found.has(match[1]!)) found.set(match[1]!, entry);
      }
    }
  };

  walk(dir);
  return found;
}

// ---------------------------------------------------------------------------
// Assertions derived directly from the product decisions in docs/02 §7.
// If a decision changes, change it HERE first — the test is the spec.
// ---------------------------------------------------------------------------

type Expectation = {
  role: string;
  permission: string;
  /** null = must NOT hold it */
  scope: ScopeType | null;
  why: string;
};

const EXPECTATIONS: Expectation[] = [
  // Decision #2 — subject teachers see fee STATUS, never payment detail.
  { role: 'subject_teacher', permission: 'fee.status.read', scope: 'section', why: 'decision #2' },
  { role: 'subject_teacher', permission: 'fee.invoice.read', scope: null, why: 'teachers are not fee collectors' },
  { role: 'subject_teacher', permission: 'fee.payment.collect', scope: null, why: 'teachers are not cashiers' },

  // Decision #5 — Principal sees a case indicator, never the notes.
  { role: 'principal', permission: 'counselling.note.read', scope: null, why: 'decision #5' },
  { role: 'principal', permission: 'counselling.case.indicator', scope: 'branch', why: 'decision #5' },
  { role: 'special_educator', permission: 'counselling.note.read', scope: 'section', why: 'sole holder' },
  { role: 'special_educator', permission: 'counselling.note.manage', scope: 'self', why: 'own caseload only' },
  { role: 'school_admin', permission: 'counselling.note.read', scope: null, why: 'admin is not clinical' },
  { role: 'platform_support', permission: 'counselling.note.read', scope: null, why: 'our staff must not see this' },

  // Decision #4 — consent belongs to the primary guardian alone.
  { role: 'parent', permission: 'privacy.consent.manage', scope: 'self', why: 'DPDP consent holder' },
  { role: 'secondary_guardian', permission: 'privacy.consent.manage', scope: null, why: 'decision #4' },

  // Scope correctness — the failure mode that leaks a whole school.
  { role: 'subject_teacher', permission: 'student.record.read', scope: 'section', why: 'own sections only' },
  { role: 'subject_teacher', permission: 'exam.marks.enter', scope: 'subject', why: 'own subject+section only' },
  { role: 'class_teacher', permission: 'attendance.student.mark', scope: 'section', why: 'own section only' },
  { role: 'parent', permission: 'student.record.read', scope: 'self', why: 'own children only' },
  { role: 'student', permission: 'student.self.read', scope: 'self', why: 'own record only' },

  // Narrow roles stay narrow.
  { role: 'security_guard', permission: 'pickup.handover.override', scope: null, why: 'override alerts the principal' },
  { role: 'security_guard', permission: 'student.document.read', scope: null, why: 'gate staff see no documents' },
  { role: 'driver', permission: 'student.document.read', scope: null, why: 'drivers see no documents' },
  { role: 'driver', permission: 'comms.message.send', scope: null, why: 'drivers do not message parents' },
  { role: 'cashier', permission: 'fee.payment.refund', scope: null, why: 'refunds need the accounts head' },
  { role: 'payroll_officer', permission: 'payroll.approve', scope: null, why: 'no self-approval' },

  // Students: no messaging, no fee visibility.
  { role: 'student', permission: 'comms.message.send', scope: null, why: 'students do not DM staff' },
  { role: 'student', permission: 'fee.status.read', scope: null, why: 'fees are a parent matter' },
];

/**
 * Screens that exist in the admin web app, and the permissions that let a role
 * *do something* on one. A role that can act with no nav entry to reach the
 * screen has authority it cannot exercise — twice now that has shipped
 * unnoticed (the approvals inbox, then staff attendance), because nothing
 * connects the permission catalogue to the navigation manifest.
 *
 * Keyed on the acting permission, not the read one, deliberately: a read-only
 * holder seeing no tab is a product choice, but someone who can approve a
 * concession and cannot find the queue is a bug.
 *
 * Only add an entry once the screen actually exists, or this check will demand
 * navigation to a 404.
 */
const SCREEN_REACHABILITY: Array<{
  screen: string;
  nav: string;
  acting: string[];
}> = [
  {
    screen: 'approvals inbox',
    nav: 'approvals',
    acting: [
      'leave.request.approve',
      'fee.concession.approve',
      'comms.announcement.approve',
    ],
  },
  {
    screen: 'parent subscriptions',
    nav: 'students.subscriptions',
    acting: ['subscription.manual.activate'],
  },
];

function verifyScreenReachability(resolved: Map<string, Map<string, ScopeType>>) {
  process.stdout.write('\n  Screen reachability\n');

  for (const { screen, nav, acting } of SCREEN_REACHABILITY) {
    const holders = SYSTEM_ROLES.filter(
      (r) =>
        r.appTarget === 'admin' &&
        acting.some((code) => resolved.get(r.code)?.has(code)),
    );
    const unreachable = holders.filter((r) => !r.nav.includes(nav));

    if (unreachable.length) {
      fail(
        'unreachable-screen',
        `${unreachable.map((r) => r.code).join(', ')} can act on the ${screen} but ` +
          `have no '${nav}' nav entry — authority they cannot reach`,
      );
    }
    process.stdout.write(
      `    ${unreachable.length === 0 ? 'PASS' : 'FAIL'}  ${nav} ` +
        `(${holders.length} admin role${holders.length === 1 ? '' : 's'} can act)\n`,
    );
  }
}

function run() {
  process.stdout.write('\nVerifying seed catalogues\n\n');

  // --- 1. Catalogue integrity -------------------------------------------
  try {
    assertNoDuplicates();
  } catch (e) {
    fail('duplicate-permission', e instanceof Error ? e.message : String(e));
  }

  for (const perm of PERMISSIONS) {
    if (!perm.scopes || perm.scopes.length === 0) {
      fail('no-scopes', `${perm.code} declares no allowed scopes`);
    }
  }

  const roleCodes = new Set<string>();
  for (const role of SYSTEM_ROLES) {
    if (roleCodes.has(role.code)) fail('duplicate-role', role.code);
    roleCodes.add(role.code);
    if (role.nav.length === 0) fail('empty-nav', `${role.code} has no navigation manifest`);
  }

  // --- 2. Per-role resolution -------------------------------------------
  const resolved = new Map<string, Map<string, ScopeType>>();

  for (const role of SYSTEM_ROLES) {
    const codes = resolvePermissionCodes(role.permissions, ALL_CODES);
    const scopes = new Map<string, ScopeType>();

    for (const code of codes) {
      if (RESTRICTED.has(code) && !RESTRICTED_HOLDERS.includes(role.code)) {
        fail('restricted-leak', `${role.code} holds restricted '${code}'`);
      }
      try {
        scopes.set(
          code,
          resolveScope(role.code, code, role.defaultScope, (BY_CODE.get(code)!.scopes ?? []) as never),
        );
      } catch (e) {
        fail('scope-resolution', e instanceof Error ? e.message : String(e));
      }
    }

    resolved.set(role.code, scopes);
    const counts: Record<string, number> = {};
    scopes.forEach((s) => (counts[s] = (counts[s] ?? 0) + 1));
    process.stdout.write(
      `  ${role.code.padEnd(24)} ${String(codes.length).padStart(3)} perms   ` +
        Object.entries(counts)
          .map(([s, n]) => `${n}@${s}`)
          .join(' ') +
        '\n',
    );
  }

  // --- 3. Product-decision expectations ---------------------------------
  process.stdout.write('\n  Decision checks\n');
  for (const exp of EXPECTATIONS) {
    const scopes = resolved.get(exp.role);
    if (!scopes) {
      fail('unknown-role', `${exp.role} in expectations but not in SYSTEM_ROLES`);
      continue;
    }
    const actual = scopes.get(exp.permission) ?? null;
    const ok = actual === exp.scope;
    if (!ok) {
      fail(
        'expectation',
        `${exp.role}.${exp.permission} = ${actual ?? 'ABSENT'}, expected ${exp.scope ?? 'ABSENT'} (${exp.why})`,
      );
    }
    process.stdout.write(
      `    ${ok ? 'PASS' : 'FAIL'}  ${exp.role}.${exp.permission} -> ${actual ?? 'absent'}\n`,
    );
  }

  // --- 4. Plan sanity ----------------------------------------------------
  const free = PLANS.find((p) => p.code === 'free');
  if (!free) fail('plan', 'no free plan defined');
  if (free && free.pricePerStudentYear !== 0) {
    fail('plan', 'the public plan must be ₹0 for schools — parents pay per student');
  }
  if (free && free.maxStudents !== null) {
    fail('plan', 'the free plan must NOT cap students');
  }
  if (PLANS.filter((p) => p.isPublic).length !== 1) {
    fail('plan', 'exactly one public plan — paid school tiers are retired');
  }
  if (PLANS.some((p) => p.code === 'basic' || p.code === 'standard' || p.code === 'pro')) {
    fail('plan', 'retired plan codes basic/standard/pro must not remain in the catalogue');
  }
  if (!CONSENT_PURPOSES.some((c) => c.isEssential)) {
    fail('consent', 'no essential consent purposes defined');
  }
  for (const purpose of CONSENT_PURPOSES) {
    if (!purpose.translations.hi) {
      fail('consent', `${purpose.code} has no Hindi translation — DPDP notices must be understandable`);
    }
  }

  // --- 5. Every template the API sends must exist ------------------------
  verifyNotificationTemplates();

  // --- 6. Every screen permission has a way in ---------------------------
  verifyScreenReachability(resolved);

  // --- Report ------------------------------------------------------------
  process.stdout.write(
    `\n  ${PERMISSIONS.length} permissions | ${SYSTEM_ROLES.length} roles | ` +
      `${PLANS.length} plans | ${CONSENT_PURPOSES.length} consent purposes\n`,
  );

  if (failures.length) {
    process.stderr.write(`\n  ${failures.length} FAILURE(S):\n`);
    for (const f of failures) process.stderr.write(`    [${f.kind}] ${f.detail}\n`);
    process.stderr.write('\n');
    process.exit(1);
  }

  process.stdout.write('\n  All checks passed.\n\n');
}

run();
