/**
 * Gapless document numbers via Postgres sequences (never MAX()+1).
 * Sequence names are derived from UUIDs (hex only) so sql.raw is injection-safe.
 */

import { sql } from 'drizzle-orm';

import type { Tx } from '../../common/database/tenant-db.service';

function seqIdent(kind: 'inv' | 'rcpt', branchId: string, sessionId: string): string {
  const b = branchId.replace(/-/g, '');
  const s = sessionId.replace(/-/g, '').slice(0, 12);
  return `fee_${kind}_${b.slice(0, 20)}_${s}`;
}

async function nextval(tx: Tx, name: string): Promise<number> {
  await tx.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS "${name}"`));
  const result = await tx.execute(sql.raw(`SELECT nextval('"${name}"') AS n`));
  const rows = result as unknown as Array<{ n: string | number }>;
  const n = rows[0]?.n ?? (result as unknown as { rows?: Array<{ n: string | number }> }).rows?.[0]?.n;
  if (n == null) throw new Error(`nextval failed for sequence ${name}`);
  return Number(n);
}

export async function nextInvoiceNo(
  tx: Tx,
  branchId: string,
  academicSessionId: string,
): Promise<string> {
  const n = await nextval(tx, seqIdent('inv', branchId, academicSessionId));
  return `INV-${n.toString().padStart(6, '0')}`;
}

export async function nextReceiptNo(
  tx: Tx,
  branchId: string,
  academicSessionId: string,
): Promise<string> {
  const n = await nextval(tx, seqIdent('rcpt', branchId, academicSessionId));
  return `RCPT-${n.toString().padStart(6, '0')}`;
}
