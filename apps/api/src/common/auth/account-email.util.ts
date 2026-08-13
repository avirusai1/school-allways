import { eq } from 'drizzle-orm';

import { users } from '@saw/db';

import { ApiException } from '../errors/api.exception';
import type { Tx } from '../database/tenant-db.service';

/** Shared by single-issue and bulk email-update — one uniqueness rule. */
export async function assertEmailAvailable(
  tx: Tx,
  email: string,
  exceptUserId?: string | null,
): Promise<void> {
  const [taken] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (taken && taken.id !== exceptUserId) {
    throw new ApiException(
      409,
      'ALREADY_EXISTS',
      'That email already belongs to another account.',
    );
  }
}
