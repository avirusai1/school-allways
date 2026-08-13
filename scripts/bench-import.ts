/**
 * Import commit bench — pilot gate.
 *
 *   pnpm exec tsx scripts/bench-import.ts --rows 1000
 *   pnpm exec tsx scripts/bench-import.ts --rows 5000
 *
 * Also: node scripts/bench-import.mjs --rows 1000  (wrapper)
 */

import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  academicSessions,
  branches,
  classes,
  guardians,
  importBatches,
  studentEnrollments,
  studentGuardians,
  students,
} from '../db/schema/index.ts';

const rowsArg = Number(process.argv.find((_, i, arr) => arr[i - 1] === '--rows') ?? 1000);
const ROWS = Number.isFinite(rowsArg) && rowsArg > 0 ? rowsArg : 1000;
const CI_LIMIT_MS = 20_000;
const CHUNK = 500;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('bench-import: DATABASE_URL is required');
  process.exit(2);
}

function rssMb() {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
}

async function writeCsv(filePath: string, n: number) {
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(filePath);
    out.write('Admission No,Student Name,Class,Section,DOB,Mobile\n');
    let i = 1;
    const write = () => {
      let ok = true;
      while (i <= n && ok) {
        const adm = `BENCH-${String(i).padStart(5, '0')}`;
        const phone = `98${String(10000000 + (i % 90000000)).padStart(8, '0')}`;
        ok = out.write(
          `${adm},Student ${i},5,A,01/01/2015,${phone}\n`,
        );
        i += 1;
      }
      if (i <= n) out.once('drain', write);
      else out.end(resolve);
    };
    out.on('error', reject);
    write();
  });
}

async function main() {
  const startRss = rssMb();
  const client = postgres(DATABASE_URL!, { max: 4, prepare: false });
  const db = drizzle(client);
  const dir = await mkdtemp(path.join(tmpdir(), 'saw-import-bench-'));
  const csvPath = path.join(dir, `students-${ROWS}.csv`);
  await writeCsv(csvPath, ROWS);

  const [ctx] = await db
    .select({
      branchId: branches.id,
      tenantId: branches.tenantId,
      sessionId: academicSessions.id,
      classId: classes.id,
    })
    .from(branches)
    .innerJoin(
      academicSessions,
      and(
        eq(academicSessions.branchId, branches.id),
        eq(academicSessions.isCurrent, true),
      ),
    )
    .innerJoin(
      classes,
      and(eq(classes.branchId, branches.id), eq(classes.isActive, true)),
    )
    .limit(1);

  if (!ctx) {
    console.error('bench-import: no branch with current session + class. Run pnpm db:seed:demo');
    await client.end();
    process.exit(2);
  }

  const importId = randomUUID();
  await db.insert(importBatches).values({
    id: importId,
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    entity: 'students',
    status: 'validated',
    vendor: 'generic',
    filePath: csvPath,
    detectedColumns: [
      'Admission No',
      'Student Name',
      'Class',
      'Section',
      'DOB',
      'Mobile',
    ],
    columnMapping: {
      'Admission No': 'admissionNo',
      'Student Name': 'firstName',
      Class: 'className',
      Section: 'sectionName',
      DOB: 'dateOfBirth',
      Mobile: 'phone',
    },
    totalRows: ROWS,
    validRows: ROWS,
    errorRows: 0,
  });

  // Parse CSV lightly (header + rows) — same shape the processor uses after map.
  const { createInterface } = await import('node:readline');
  const { createReadStream } = await import('node:fs');
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
  let headers: string[] = [];
  const prepared: Array<{
    admissionNo: string;
    firstName: string;
    phone: string;
  }> = [];
  for await (const line of rl) {
    if (!headers.length) {
      headers = line.split(',');
      continue;
    }
    if (!line.trim()) continue;
    const cols = line.split(',');
    prepared.push({
      admissionNo: cols[0]!,
      firstName: cols[1]!,
      phone: cols[5]!,
    });
  }

  const t0 = performance.now();
  let committed = 0;

  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK);
    const studentIds = chunk.map(() => randomUUID());

    await db.transaction(async (tx) => {
      await tx.insert(students).values(
        chunk.map((r, idx) => ({
          id: studentIds[idx]!,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          admissionNo: r.admissionNo,
          firstName: r.firstName,
          dateOfBirth: '2015-01-01',
          importBatchId: importId,
        })),
      );

      await tx.insert(studentEnrollments).values(
        chunk.map((_, idx) => ({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          studentId: studentIds[idx]!,
          academicSessionId: ctx.sessionId,
          classId: ctx.classId,
          importBatchId: importId,
        })),
      );

      const byPhone = new Map<string, { id: string; studentIds: string[] }>();
      chunk.forEach((r, idx) => {
        const phone = r.phone.startsWith('91') ? r.phone : `91${r.phone}`;
        const existing = byPhone.get(phone);
        if (existing) existing.studentIds.push(studentIds[idx]!);
        else byPhone.set(phone, { id: randomUUID(), studentIds: [studentIds[idx]!] });
      });

      if (byPhone.size > 0) {
        await tx.insert(guardians).values(
          [...byPhone.entries()].map(([phone, g]) => ({
            id: g.id,
            tenantId: ctx.tenantId,
            fullName: `Parent ${phone.slice(-4)}`,
            phone,
            importBatchId: importId,
          })),
        );

        await tx.insert(studentGuardians).values(
          [...byPhone.values()].flatMap((g) =>
            g.studentIds.map((studentId) => ({
              tenantId: ctx.tenantId,
              studentId,
              guardianId: g.id,
              relation: 'father' as const,
              isPrimary: true,
              importBatchId: importId,
            })),
          ),
        );
      }
    });

    committed += chunk.length;
    await db
      .update(importBatches)
      .set({ committedRows: committed })
      .where(eq(importBatches.id, importId));
  }

  await db
    .update(importBatches)
    .set({ status: 'committed', committedAt: new Date(), committedRows: committed })
    .where(eq(importBatches.id, importId));

  const elapsed = performance.now() - t0;
  const peakRss = rssMb();

  const undoT0 = performance.now();
  await db.transaction(async (tx) => {
    await tx.delete(studentGuardians).where(eq(studentGuardians.importBatchId, importId));
    await tx.delete(guardians).where(eq(guardians.importBatchId, importId));
    await tx.delete(studentEnrollments).where(eq(studentEnrollments.importBatchId, importId));
    await tx.delete(students).where(eq(students.importBatchId, importId));
    await tx
      .update(importBatches)
      .set({ status: 'undone', undoneAt: new Date() })
      .where(eq(importBatches.id, importId));
  });
  const undoMs = performance.now() - undoT0;

  await db.delete(importBatches).where(eq(importBatches.id, importId));
  await rm(dir, { recursive: true, force: true });
  await client.end();

  const report = {
    rows: ROWS,
    committed,
    elapsedMs: Math.round(elapsed),
    undoMs: Math.round(undoMs),
    startRssMb: startRss,
    peakRssMb: peakRss,
    under20s: elapsed < CI_LIMIT_MS,
  };
  console.log(JSON.stringify(report, null, 2));

  if (ROWS <= 1000 && elapsed >= CI_LIMIT_MS) {
    console.error(
      `bench-import: FAIL — ${ROWS} rows took ${Math.round(elapsed)}ms (limit ${CI_LIMIT_MS}ms)`,
    );
    process.exit(1);
  }
  if (ROWS >= 5000 && peakRss - startRss > 400) {
    console.error(
      `bench-import: FAIL — RSS grew ${peakRss - startRss} MB (start ${startRss}, peak ${peakRss})`,
    );
    process.exit(1);
  }
  console.log('bench-import: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
