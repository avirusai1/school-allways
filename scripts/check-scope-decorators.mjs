#!/usr/bin/env node
/**
 * CI guard: :id routes whose permission is legal at `self` or `section`
 * scope (per db/seeds/permissions.ts) must declare @Grant on the same handler
 * — unless the handler is on the explicit INTERNALLY_ENFORCED allowlist.
 *
 * Also fails hard on `void grant;` — that pattern converts an open scope
 * question into false CI green. If enforcement is internal, drop @Grant and
 * allowlist the handler with a reason instead.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERMISSIONS_FILE = path.join(ROOT, 'db/seeds/permissions.ts');
const CONTROLLERS_DIR = path.join(ROOT, 'apps/api/src/modules');

/**
 * Handlers that enforce ownership without @Grant (participant join, delivery
 * row, copyright gate, etc.). Key: `<basename>#<methodName>`.
 * Reasons are required — an allowlist without a why is just another void.
 */
const INTERNALLY_ENFORCED = new Map([
  [
    'communication.controller.ts#acknowledge',
    'Requires a delivery_attempts row for ctx.userId before acknowledging.',
  ],
  [
    'communication.controller.ts#listMessages',
    'repo.isParticipant(ctx.userId) before returning any message.',
  ],
  [
    'communication.controller.ts#sendMessage',
    'repo.isParticipant(ctx.userId) before insert.',
  ],
  [
    'communication.controller.ts#markRead',
    'Updates only the caller’s participant row via ctx.userId.',
  ],
  [
    'transport.controller.ts#sos',
    'SOS is intentional panic from the authenticated driver session; audited.',
  ],
  [
    'books.controller.ts#addFile',
    'Copyright + book existence gates; manage is branch/section via publish path.',
  ],
]);

/** Permissions that may be granted narrower than branch — those need @Grant. */
function loadNarrowPermissionCodes(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const codes = new Set();
  const callRe =
    /p\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*(?:`[^`]*`|'[^']*')(?:\s*,\s*(\{[\s\S]*?\}))?\s*\)/g;
  let m;
  while ((m = callRe.exec(src))) {
    const code = m[1];
    const opts = m[2] ?? '';
    if (!opts.includes('scopes')) continue;
    const narrow =
      opts.includes('...ALL') ||
      opts.includes('...BRANCHY_OR_SELF') ||
      /['"]self['"]/.test(opts) ||
      /['"]section['"]/.test(opts);
    if (narrow) codes.add(code);
  }
  return codes;
}

function walkControllers(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkControllers(full));
    else if (entry.isFile() && entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

function extractHandlers(src) {
  const handlers = [];
  const httpRe = /@(Get|Post|Patch|Delete)\((['"`])([^'"`]*)\2\)/g;
  let m;
  while ((m = httpRe.exec(src))) {
    const httpMethod = m[1];
    const routePath = m[3];
    const start = m.index;
    const slice = src.slice(start, start + 2000);
    const bodyMatch = slice.match(/^[\s\S]*?\)\s*(?::\s*[^{\n]+)?\s*\{/);
    const block = bodyMatch ? bodyMatch[0] : slice.slice(0, 900);

    const perms = [];
    for (const pm of block.matchAll(/@RequirePermission\(([^)]+)\)/g)) {
      for (const q of pm[1].matchAll(/['"]([^'"]+)['"]/g)) {
        perms.push(q[1]);
      }
    }
    const hasGrant = /@Grant\s*\(/.test(block);
    const hasVoidGrant = /\bvoid\s+grant\s*;/.test(block);
    const methodMatch = block.match(
      /\n\s*(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    );
    const methodName = methodMatch?.[1] ?? 'unknown';
    const line = src.slice(0, start).split('\n').length;
    handlers.push({
      httpMethod,
      routePath,
      perms,
      hasGrant,
      hasVoidGrant,
      methodName,
      line,
      block,
    });
  }
  return handlers;
}

function main() {
  const narrow = loadNarrowPermissionCodes(PERMISSIONS_FILE);
  if (narrow.size === 0) {
    console.error(
      'check-scope-decorators: failed to parse any narrow permissions from',
      PERMISSIONS_FILE,
    );
    process.exit(2);
  }

  const violations = [];

  for (const file of walkControllers(CONTROLLERS_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const base = path.basename(file);

    // Anywhere in a controller — void grant is never acceptable.
    if (/\bvoid\s+grant\s*;/.test(src)) {
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (/\bvoid\s+grant\s*;/.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            kind: 'void-grant',
            detail: '`void grant;` silences an unused grant — enforce or allowlist without @Grant',
          });
        }
      });
    }

    for (const h of extractHandlers(src)) {
      if (!h.routePath.includes(':id')) continue;
      const needsGrant = h.perms.filter((p) => narrow.has(p));
      if (needsGrant.length === 0) continue;

      const key = `${base}#${h.methodName}`;
      const allowReason = INTERNALLY_ENFORCED.get(key);

      if (h.hasVoidGrant) {
        violations.push({
          file: rel,
          line: h.line,
          kind: 'void-grant',
          detail: `${h.httpMethod} ${h.routePath} has void grant`,
        });
        continue;
      }

      if (h.hasGrant) {
        // Grant present and not voided — ok (service must use it; void is caught above).
        if (allowReason) {
          violations.push({
            file: rel,
            line: h.line,
            kind: 'allowlist-with-grant',
            detail: `${key} is allowlisted as internally enforced but still has @Grant — remove the decorator`,
          });
        }
        continue;
      }

      if (allowReason) continue;

      violations.push({
        file: rel,
        line: h.line,
        kind: 'missing-grant',
        detail: `${h.httpMethod} ${h.routePath} requires @Grant for ${needsGrant.join(', ')} (or add to INTERNALLY_ENFORCED with a reason)`,
      });
    }
  }

  // Stale allowlist entries.
  for (const key of INTERNALLY_ENFORCED.keys()) {
    const [fileName, method] = key.split('#');
    const file = walkControllers(CONTROLLERS_DIR).find((f) => path.basename(f) === fileName);
    if (!file) {
      violations.push({
        file: fileName,
        line: 0,
        kind: 'stale-allowlist',
        detail: `${key} — controller file missing`,
      });
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    if (!new RegExp(`\\b${method}\\s*\\(`).test(src)) {
      violations.push({
        file: path.relative(ROOT, file),
        line: 0,
        kind: 'stale-allowlist',
        detail: `${key} — method not found`,
      });
    }
  }

  if (violations.length === 0) {
    console.log(
      `check-scope-decorators: ok (${narrow.size} narrow permissions, ${INTERNALLY_ENFORCED.size} internally-enforced allowlist)`,
    );
    process.exit(0);
  }

  console.error('check-scope-decorators: violations:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.detail}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

main();
