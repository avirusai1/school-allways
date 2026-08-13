import { z } from 'zod';

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  fullName: z.string(),
  displayName: z.string().nullish(),
  photoUrl: z.string().nullish(),
  preferredLanguage: z.string().optional(),
  isMinor: z.boolean().optional(),
});

export const tenantInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  primaryColor: z.string().nullish(),
  logoUrl: z.string().nullish(),
  board: z.string().optional(),
  currentAcademicSessionId: z.string().uuid().nullish(),
  currentAcademicSessionName: z.string().nullish(),
  /** Null means the onboarding wizard is still required (unless locally skipped). */
  onboardingCompletedAt: z.string().nullish(),
});

export const sessionBranchSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullish(),
});

export const sessionRoleSchema = z.object({
  code: z.string(),
  name: z.string(),
  isPrimary: z.boolean().optional().default(false),
});

export const sessionScopesSchema = z.object({
  sectionIds: z.array(z.string().uuid()).default([]),
  subjectIds: z.array(z.string().uuid()).default([]),
  studentIds: z.array(z.string().uuid()).default([]),
});

export const sessionFeaturesSchema = z
  .object({
    safeReporting: z.boolean().optional().default(false),
    transport: z.boolean().optional(),
    books: z.boolean().optional(),
    canteen: z.boolean().optional(),
    onlinePayments: z.boolean().optional(),
  })
  .passthrough();

export const authSessionSchema = z
  .object({
    user: sessionUserSchema,
    tenant: tenantInfoSchema,
    branch: sessionBranchSchema.nullish(),
    roles: z.array(sessionRoleSchema).default([]),
    permissions: z.array(z.string()).default([]),
    scopes: sessionScopesSchema.default({}),
    navManifest: z.array(z.string()).default([]),
    homeScreen: z.string().nullish(),
    features: sessionFeaturesSchema.nullish(),
  })
  .passthrough();

/**
 * The platform console's session. No tenant, no branch, no scopes — a platform
 * admin sits outside every school rather than inside one.
 */
export const platformSessionSchema = z
  .object({
    user: sessionUserSchema,
    roles: z.array(sessionRoleSchema).default([]),
    permissions: z.array(z.string()).default([]),
    navManifest: z.array(z.string()).default([]),
    homeScreen: z.string().nullish(),
  })
  .passthrough();

export type AuthSession = z.infer<typeof authSessionSchema>;
export type PlatformSession = z.infer<typeof platformSessionSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    nextCursor: z.string().nullish(),
    hasMore: z.boolean().optional().default(false),
  });

export const studentListItemSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  admissionNo: z.string().nullish(),
  rollNo: z.string().nullish(),
  className: z.string().nullish(),
  sectionName: z.string().nullish(),
  photoUrl: z.string().nullish(),
  status: z.string().optional(),
});

export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const otpRequestSchema = z.object({
  phone: z.string().min(10).max(15),
});

export const otpVerifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
  tenantId: z.string().uuid().optional(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string()).optional(),
});
