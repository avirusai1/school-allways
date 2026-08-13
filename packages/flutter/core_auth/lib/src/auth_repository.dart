import 'package:core_models/core_models.dart';
import 'package:core_network/core_network.dart';

import 'token_store.dart';

class OtpRequestResult {
  const OtpRequestResult({
    required this.expiresInSeconds,
    required this.resendAfterSeconds,
    this.devOtp,
  });

  final int expiresInSeconds;
  final int resendAfterSeconds;
  final String? devOtp;
}

class AuthTokensResult {
  const AuthTokensResult({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.requiresTenantSelection,
    required this.tenants,
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final bool requiresTenantSelection;
  final List<TenantSummary> tenants;
}

class TenantSummary {
  const TenantSummary({
    required this.id,
    required this.name,
    required this.slug,
    this.logoUrl,
    this.branchId,
    this.branchName,
    this.city,
    this.childNames = const [],
  });

  final String id;
  final String name;
  final String slug;
  final String? logoUrl;
  final String? branchId;
  final String? branchName;
  final String? city;
  final List<String> childNames;

  factory TenantSummary.fromJson(Map<String, dynamic> json) {
    return TenantSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String? ?? '',
      logoUrl: json['logoUrl'] as String?,
      branchId: json['branchId'] as String?,
      branchName: json['branchName'] as String?,
      city: json['city'] as String?,
      childNames:
          (json['childNames'] as List<dynamic>? ?? const []).cast<String>(),
    );
  }
}

/// Auth API + local session cache.
class AuthRepository {
  AuthRepository({
    required ApiClient api,
    required TokenStore tokenStore,
  })  : _api = api,
        _tokens = tokenStore;

  final ApiClient _api;
  final TokenStore _tokens;

  AuthSession? _cached;

  AuthSession? get cachedSession => _cached;

  Future<AuthSession?> restore() async {
    final access = await _tokens.readAccessToken();
    if (access == null) return null;
    try {
      return await fetchSession();
    } catch (_) {
      try {
        await refreshTokens();
        return await fetchSession();
      } catch (_) {
        await _tokens.clear();
        return null;
      }
    }
  }

  Future<OtpRequestResult> requestOtp(String phone) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/otp/request',
      data: {'phone': phone, 'purpose': 'login'},
    );
    final body = res.data ?? const <String, dynamic>{};
    return OtpRequestResult(
      expiresInSeconds: body['expiresInSeconds'] as int? ?? 300,
      resendAfterSeconds: body['resendAfterSeconds'] as int? ?? 60,
      devOtp: body['devOtp'] as String?,
    );
  }

  Future<AuthTokensResult> verifyOtp(String phone, String code) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      data: {'phone': phone, 'purpose': 'login', 'code': code},
    );
    final body = res.data ?? const <String, dynamic>{};
    return _persistTokens(body);
  }

  Future<AuthTokensResult> passwordLogin(String email, String password) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/password/login',
      data: {'email': email, 'password': password},
    );
    final body = res.data ?? const <String, dynamic>{};
    return _persistTokens(body);
  }

  Future<AuthTokensResult> _persistTokens(Map<String, dynamic> body) async {
    final access = body['accessToken'] as String;
    final refresh = body['refreshToken'] as String;
    await _tokens.writeTokens(accessToken: access, refreshToken: refresh);

    final tenants = (body['tenants'] as List<dynamic>? ?? const [])
        .map((e) => TenantSummary.fromJson(e as Map<String, dynamic>))
        .toList();

    return AuthTokensResult(
      accessToken: access,
      refreshToken: refresh,
      expiresIn: body['expiresIn'] as int? ?? 900,
      requiresTenantSelection: body['requiresTenantSelection'] as bool? ?? false,
      tenants: tenants,
    );
  }

  /// POST /auth/select-tenant — scopes the session to one school.
  Future<void> selectTenant(String tenantId, {String? branchId}) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/select-tenant',
      data: {
        'tenantId': tenantId,
        if (branchId != null) 'branchId': branchId,
      },
    );
    final body = res.data ?? const <String, dynamic>{};
    final access = body['accessToken'] as String?;
    if (access != null) {
      final refresh = await _tokens.readRefreshToken() ?? '';
      await _tokens.writeTokens(accessToken: access, refreshToken: refresh);
    }
  }

  /// Historical name — always hits select-tenant.
  Future<AuthSession> switchTenant(String tenantId) async {
    await selectTenant(tenantId);
    return fetchSession();
  }

  Future<AuthSession> fetchSession() async {
    final res = await _api.get<Map<String, dynamic>>('/auth/session');
    final data = res.data ?? const <String, dynamic>{};
    final session = AuthSession.fromJson(data);
    _cached = session;
    return session;
  }

  Future<void> refreshTokens() async {
    final refresh = await _tokens.readRefreshToken();
    if (refresh == null) {
      throw const UnauthenticatedException(message: 'No refresh token');
    }
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/refresh',
      data: {'refreshToken': refresh},
    );
    final body = res.data ?? const <String, dynamic>{};
    await _tokens.writeTokens(
      accessToken: body['accessToken'] as String,
      refreshToken: body['refreshToken'] as String? ?? refresh,
    );
  }

  /// POST /auth/logout then clear local tokens.
  Future<void> logout() async {
    try {
      await _api.post<void>('/auth/logout');
    } catch (_) {
      // Always clear locally even if the network call fails.
    }
    _cached = null;
    await _tokens.clear();
  }

  Future<void> signOut() => logout();

  /// POST /auth/device-token — upsert on the FCM token string.
  Future<void> registerDeviceToken({
    required String fcmToken,
    required String platform,
    required String appId,
    String? deviceId,
  }) async {
    await _api.post<void>(
      '/auth/device-token',
      data: {
        'fcmToken': fcmToken,
        'platform': platform,
        'appId': appId,
        if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
      },
    );
  }

  /// DELETE /auth/device-token — mark this handset inactive immediately.
  Future<void> unregisterDeviceToken(String fcmToken) async {
    await _api.delete<void>(
      '/auth/device-token',
      data: {'fcmToken': fcmToken},
    );
  }
}
