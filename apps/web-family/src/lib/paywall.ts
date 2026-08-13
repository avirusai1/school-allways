import { ApiError } from './api';

export function isSubscriptionRequired(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 402 || err.code === 'SUBSCRIPTION_REQUIRED');
}
