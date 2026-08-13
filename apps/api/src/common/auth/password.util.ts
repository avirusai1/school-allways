import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** Same Argon2id parameters as `db/seeds/platform-admin.ts` (E3). */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Handed to the admin once in the API response — never logged, never stored
 * in plaintext. 16 bytes → 22-char base64url, comfortably over the 8-char
 * password-login minimum.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(16).toString('base64url');
}
