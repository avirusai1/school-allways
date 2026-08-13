import { and, eq } from 'drizzle-orm';

import { academicSessions, stayConnectedFees } from '@saw/db';

import type { Tx } from '../../common/database/tenant-db.service';
import {
  STAY_CONNECTED_BASE_PAISE,
  STAY_CONNECTED_GST_PAISE,
  STAY_CONNECTED_TOTAL_PAISE,
} from './billing.constants';

/** Session endDate is a calendar date; the fee is due through that day in IST. */
export function endOfDayIst(isoDate: string): Date {
  return new Date(`${isoDate}T18:29:59.000Z`);
}

/**
 * One Stay Connected Fee per tenant per academic-year name, regardless of
 * how many branch session rows share that name.
 */
export async function ensureStayConnectedFee(
  tx: Tx,
  params: {
    tenantId: string;
    academicSessionId: string;
    sessionName: string;
    sessionEndDate: string;
    userId: string | null;
  },
): Promise<void> {
  const [existing] = await tx
    .select({ id: stayConnectedFees.id })
    .from(stayConnectedFees)
    .innerJoin(academicSessions, eq(academicSessions.id, stayConnectedFees.academicSessionId))
    .where(
      and(
        eq(stayConnectedFees.tenantId, params.tenantId),
        eq(academicSessions.name, params.sessionName),
      ),
    )
    .limit(1);

  if (existing) return;

  await tx
    .insert(stayConnectedFees)
    .values({
      tenantId: params.tenantId,
      academicSessionId: params.academicSessionId,
      basePaise: STAY_CONNECTED_BASE_PAISE,
      gstPaise: STAY_CONNECTED_GST_PAISE,
      totalPaise: STAY_CONNECTED_TOTAL_PAISE,
      status: 'pending',
      dueDate: endOfDayIst(params.sessionEndDate),
      createdBy: params.userId,
    })
    .onConflictDoNothing();
}
