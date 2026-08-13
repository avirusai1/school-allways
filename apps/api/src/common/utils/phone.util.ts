/** 919876543210 -> 9198XXXX3210. Never log or return a full number. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone || phone.length < 8) return null;
  return `${phone.slice(0, 4)}XXXX${phone.slice(-4)}`;
}
