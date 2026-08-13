import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../context/request-context';

export const PERMISSIONS_KEY = 'saw:permissions';
export const ANY_PERMISSIONS_KEY = 'saw:any-permissions';
export const PUBLIC_KEY = 'saw:public';
export const NO_TENANT_KEY = 'saw:no-tenant';
export const PLATFORM_ONLY_KEY = 'saw:platform-only';

/**
 * Require one or more permissions. ALL listed codes must be held.
 *
 *   @RequirePermission('attendance.student.mark')
 *   @RequirePermission('exam.marks.enter', 'exam.read')
 */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

/**
 * Require at least one of the listed permissions (OR, not AND).
 * Use when two roles may reach the same endpoint via different grants.
 */
export const RequireAnyPermission = (...codes: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, codes);

/** No authentication at all: signup, OTP request, health, webhooks. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Authenticated, but before a tenant has been chosen — the school switcher,
 * "which schools do my children attend", accepting an invitation.
 */
export const NoTenantRequired = () => SetMetadata(NO_TENANT_KEY, true);

/**
 * Platform console routes. Requires JWT `pa` claim (platform user).
 * No school tenant selection — queries run with app.platform_admin.
 */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

/**
 * Inject the resolved grant for a permission, so a handler can pass it to
 * scopeFilter() without reaching into the context manually.
 *
 *   findAll(@Grant('student.record.read') grant: GrantedPermission) { ... }
 */
export const Grant = createParamDecorator(
  (code: string, _ctx: ExecutionContext): GrantedPermission => {
    const grant = RequestContextStore.get().permissions.get(code);
    if (!grant) {
      // Should be unreachable — PermissionGuard runs first. If it fires, a
      // handler asked for a grant it never declared via @RequirePermission.
      throw new Error(
        `@Grant('${code}') used without a matching @RequirePermission('${code}')`,
      );
    }
    return grant;
  },
);

/** The current request context, for handlers that need userId/branchId. */
export const Ctx = createParamDecorator(() => RequestContextStore.get());
