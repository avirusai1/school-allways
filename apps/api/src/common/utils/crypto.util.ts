import { createHash, randomBytes, randomInt } from 'node:crypto';

/** SHA-256 hex digest — used for OTP codes and refresh token storage. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically secure 6-digit OTP. Never use Math.random. */
export function generateOtpCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/** Opaque refresh token — the client never parses this. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}
