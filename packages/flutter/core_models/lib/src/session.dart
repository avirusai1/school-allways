/// Session payload from GET /auth/session.
class AuthSession {
  const AuthSession({
    required this.user,
    required this.tenant,
    required this.permissions,
    required this.navManifest,
    required this.scopes,
    this.roles = const [],
    this.homeScreen,
    this.branch,
    this.features,
    this.settings,
  });

  final SessionUser user;
  final TenantInfo tenant;
  final SessionBranch? branch;
  final List<SessionRole> roles;
  final List<String> permissions;
  final SessionScopes scopes;
  final List<String> navManifest;
  final String? homeScreen;
  final SessionFeatures? features;
  final SessionSettings? settings;

  String get userId => user.id;
  String get tenantId => tenant.id;
  List<String> get studentIds => scopes.studentIds;
  String? get academicSessionId => tenant.currentAcademicSessionId;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    final userJson = json['user'] as Map<String, dynamic>? ?? const {};
    return AuthSession(
      user: SessionUser.fromJson(userJson),
      tenant: TenantInfo.fromJson(
        json['tenant'] as Map<String, dynamic>? ?? const {},
      ),
      branch: json['branch'] is Map<String, dynamic>
          ? SessionBranch.fromJson(json['branch'] as Map<String, dynamic>)
          : null,
      roles: (json['roles'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SessionRole.fromJson)
          .toList(),
      permissions: (json['permissions'] as List<dynamic>? ?? const [])
          .cast<String>(),
      scopes: SessionScopes.fromJson(
        json['scopes'] as Map<String, dynamic>? ?? const {},
      ),
      navManifest:
          (json['navManifest'] as List<dynamic>? ?? const []).cast<String>(),
      homeScreen: json['homeScreen'] as String?,
      features: json['features'] is Map<String, dynamic>
          ? SessionFeatures.fromJson(json['features'] as Map<String, dynamic>)
          : null,
      settings: json['settings'] is Map<String, dynamic>
          ? SessionSettings.fromJson(json['settings'] as Map<String, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'user': user.toJson(),
        'tenant': {
          'id': tenant.id,
          'name': tenant.name,
          'slug': tenant.slug,
          'primaryColor': tenant.primaryColor,
          'logoUrl': tenant.logoUrl,
        },
        'branch': branch == null
            ? null
            : {
                'id': branch!.id,
                'name': branch!.name,
                'code': branch!.code,
              },
        'roles': roles
            .map((r) => {
                  'code': r.code,
                  'name': r.name,
                  'isPrimary': r.isPrimary,
                })
            .toList(),
        'permissions': permissions,
        'scopes': {
          'sectionIds': scopes.sectionIds,
          'subjectIds': scopes.subjectIds,
          'studentIds': scopes.studentIds,
        },
        'navManifest': navManifest,
        'homeScreen': homeScreen,
        'features': features == null
            ? null
            : {
                'safeReporting': features!.safeReporting,
                'transport': features!.transport,
                'books': features!.books,
                'canteen': features!.canteen,
                'onlinePayments': features!.onlinePayments,
              },
        'settings': settings == null
            ? null
            : {
                'attendanceMode': settings!.attendanceMode,
                'quietHoursStart': settings!.quietHoursStart,
                'quietHoursEnd': settings!.quietHoursEnd,
              },
      };
}

class SessionUser {
  const SessionUser({
    required this.id,
    required this.fullName,
    required this.kind,
    required this.isMinor,
    this.displayName,
    this.photoUrl,
    this.preferredLanguage = 'en',
  });

  final String id;
  final String fullName;
  final String kind;
  final bool isMinor;
  final String? displayName;
  final String? photoUrl;
  final String preferredLanguage;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      kind: json['kind'] as String? ?? 'guardian',
      isMinor: json['isMinor'] as bool? ?? false,
      displayName: json['displayName'] as String?,
      photoUrl: json['photoUrl'] as String?,
      preferredLanguage: json['preferredLanguage'] as String? ?? 'en',
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'kind': kind,
        'isMinor': isMinor,
        'displayName': displayName,
        'photoUrl': photoUrl,
        'preferredLanguage': preferredLanguage,
      };
}

class TenantInfo {
  const TenantInfo({
    required this.id,
    required this.name,
    this.slug,
    this.primaryColor,
    this.logoUrl,
    this.board,
    this.currentAcademicSessionId,
    this.currentAcademicSessionName,
  });

  final String id;
  final String name;
  final String? slug;

  /// Hex string like "#1B5E9C" or null.
  final String? primaryColor;
  final String? logoUrl;
  final String? board;
  final String? currentAcademicSessionId;
  final String? currentAcademicSessionName;

  factory TenantInfo.fromJson(Map<String, dynamic> json) {
    return TenantInfo(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String?,
      primaryColor: json['primaryColor']?.toString(),
      logoUrl: json['logoUrl'] as String?,
      board: json['board'] as String?,
      currentAcademicSessionId: json['currentAcademicSessionId'] as String?,
      currentAcademicSessionName: json['currentAcademicSessionName'] as String?,
    );
  }
}

class SessionBranch {
  const SessionBranch({required this.id, required this.name, this.code});

  final String id;
  final String name;
  final String? code;

  factory SessionBranch.fromJson(Map<String, dynamic> json) {
    return SessionBranch(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      code: json['code'] as String?,
    );
  }
}

class SessionRole {
  const SessionRole({
    required this.code,
    required this.name,
    this.isPrimary = false,
  });

  final String code;
  final String name;
  final bool isPrimary;

  factory SessionRole.fromJson(Map<String, dynamic> json) {
    return SessionRole(
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
      isPrimary: json['isPrimary'] as bool? ?? false,
    );
  }
}

class SessionScopes {
  const SessionScopes({
    this.sectionIds = const [],
    this.subjectIds = const [],
    this.studentIds = const [],
  });

  final List<String> sectionIds;
  final List<String> subjectIds;
  final List<String> studentIds;

  factory SessionScopes.fromJson(Map<String, dynamic> json) {
    return SessionScopes(
      sectionIds:
          (json['sectionIds'] as List<dynamic>? ?? const []).cast<String>(),
      subjectIds:
          (json['subjectIds'] as List<dynamic>? ?? const []).cast<String>(),
      studentIds:
          (json['studentIds'] as List<dynamic>? ?? const []).cast<String>(),
    );
  }
}

class SessionFeatures {
  const SessionFeatures({
    this.safeReporting = false,
    this.transport = false,
    this.books = false,
    this.canteen = false,
    this.onlinePayments = false,
  });

  final bool safeReporting;
  final bool transport;
  final bool books;
  final bool canteen;
  final bool onlinePayments;

  factory SessionFeatures.fromJson(Map<String, dynamic> json) {
    return SessionFeatures(
      safeReporting: json['safeReporting'] as bool? ?? false,
      transport: json['transport'] as bool? ?? false,
      books: json['books'] as bool? ?? false,
      canteen: json['canteen'] as bool? ?? false,
      onlinePayments: json['onlinePayments'] as bool? ?? false,
    );
  }
}

class SessionSettings {
  const SessionSettings({
    this.attendanceMode = 'daily',
    this.quietHoursStart = '21:00',
    this.quietHoursEnd = '07:00',
  });

  final String attendanceMode;
  final String quietHoursStart;
  final String quietHoursEnd;

  factory SessionSettings.fromJson(Map<String, dynamic> json) {
    return SessionSettings(
      attendanceMode: json['attendanceMode'] as String? ?? 'daily',
      quietHoursStart: json['quietHoursStart'] as String? ?? '21:00',
      quietHoursEnd: json['quietHoursEnd'] as String? ?? '07:00',
    );
  }
}
