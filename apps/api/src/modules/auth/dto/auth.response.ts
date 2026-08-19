export class AuthUserDto {
  id!: string;
  fullName!: string;
  preferredLanguage!: string;
  kind!: string;
  isMinor!: boolean;
}

export class AuthUserProfileDto extends AuthUserDto {
  displayName!: string | null;
  photoUrl!: string | null;
}

export class TenantSummaryDto {
  id!: string;
  name!: string;
  slug!: string;
  logoUrl!: string | null;
  branchId!: string | null;
  branchName!: string | null;
}

export class RequestOtpResponseDto {
  sent!: boolean;
  expiresInSeconds!: number;
  resendAfterSeconds!: number;
  devOtp?: string;
}

export class AuthTokensResponseDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
  requiresTenantSelection!: boolean;
  user!: AuthUserDto;
  tenants!: TenantSummaryDto[];
}

export class JoinStudentDto {
  id!: string;
  name!: string;
  className!: string | null;
  sectionName!: string | null;
  photoUrl!: string | null;
  /**
   * Which of the details the invitation promised the parent would fill are
   * still blank on this child. Empty means the import already covered them and
   * the parent should not be shown a form asking for nothing.
   */
  missingFields!: Array<'address' | 'photo' | 'dateOfBirth' | 'bloodGroup'>;
}

export class JoinStaffDto {
  id!: string;
  name!: string;
  designation!: string | null;
  department!: string | null;
}

/**
 * Four outcomes, one 200 response, discriminated on `status`.
 *
 * Three of the four are ordinary situations rather than faults: a mistyped
 * link, a link left until after it expired, a parent opening the same message
 * on a second phone. Modelling those as HTTP errors would put a red failure
 * toast in front of a parent for behaving normally, and the spec explicitly
 * asks for "already activated" not to hard-fail. Returning 200 throughout also
 * means an attacker probing tokens cannot tell the cases apart by status code.
 */
export class JoinResponseDto {
  status!: 'invalid' | 'expired' | 'already_activated' | 'pending' | 'joined';
  /** Absent for `invalid` — we have no row, so we know of no school to name. */
  schoolName?: string;
  purpose?: 'parent_profile' | 'staff_invite' | 'student_invite' | 'signup_handoff';
  auth?: AuthTokensResponseDto;
  students?: JoinStudentDto[];
  staff?: JoinStaffDto;
}

export class RefreshResponseDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
}

export class SelectTenantResponseDto {
  accessToken!: string;
  expiresIn!: number;
}

export class SessionRoleDto {
  code!: string;
  name!: string;
  isPrimary!: boolean;
}

export class SessionScopesDto {
  sectionIds!: string[];
  subjectIds!: string[];
  studentIds!: string[];
}

export class SessionFeaturesDto {
  safeReporting!: boolean;
  transport!: boolean;
  books!: boolean;
  canteen!: boolean;
  onlinePayments!: boolean;
}

export class SessionSettingsDto {
  attendanceMode!: string;
  quietHoursStart!: string;
  quietHoursEnd!: string;
}

export class SessionTenantDto {
  id!: string;
  name!: string;
  slug!: string;
  logoUrl!: string | null;
  primaryColor!: string | null;
  board!: string;
  currentAcademicSessionId!: string | null;
  currentAcademicSessionName!: string | null;
  onboardingCompletedAt!: string | null;
}

export class SessionBranchDto {
  id!: string;
  name!: string;
  code!: string;
}

export class SessionResponseDto {
  user!: AuthUserProfileDto;
  tenant!: SessionTenantDto;
  branch!: SessionBranchDto;
  roles!: SessionRoleDto[];
  permissions!: string[];
  scopes!: SessionScopesDto;
  navManifest!: string[];
  homeScreen!: string | null;
  features!: SessionFeaturesDto;
  settings!: SessionSettingsDto;
}

/**
 * The console's session. Deliberately has no `tenant`, `branch`, `scopes` or
 * `settings`: a platform admin is not inside a school, and this response is
 * built without reading one.
 */
export class PlatformSessionDto {
  user!: AuthUserProfileDto;
  roles!: SessionRoleDto[];
  permissions!: string[];
  navManifest!: string[];
  homeScreen!: string | null;
}

export class MeResponseDto {
  user!: AuthUserProfileDto;
  tenants!: TenantSummaryDto[];
}
