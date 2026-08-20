/// Typed API errors. Always show [message] from the server — it is written
/// for school users. Never substitute "Something went wrong".
sealed class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.fields,
  });

  final String code;
  final String message;
  final Map<String, String>? fields;

  @override
  String toString() => '$runtimeType($code): $message';
}

/// 400 VALIDATION_FAILED
class ValidationException extends ApiException {
  const ValidationException({
    required super.message,
    super.fields,
    super.code = 'VALIDATION_FAILED',
  });
}

/// 401
class UnauthenticatedException extends ApiException {
  const UnauthenticatedException({
    required super.message,
    super.code = 'UNAUTHENTICATED',
  });
}

/// 403 PERMISSION_DENIED
class PermissionException extends ApiException {
  const PermissionException({
    required super.message,
    super.code = 'PERMISSION_DENIED',
  });
}

/// 403 SCOPE_VIOLATION
class ScopeException extends ApiException {
  const ScopeException({
    required super.message,
    super.code = 'SCOPE_VIOLATION',
  });
}

/// 409
class ConflictException extends ApiException {
  const ConflictException({
    required super.message,
    super.code = 'CONFLICT',
  });
}

/// 429
class RateLimitException extends ApiException {
  const RateLimitException({
    required super.message,
    required this.retryAfterSeconds,
    super.code = 'RATE_LIMITED',
  });

  final int retryAfterSeconds;
}

/// No network / DNS / timeout.
class OfflineException extends ApiException {
  const OfflineException({
    super.message = 'You appear to be offline. Changes will sync when you reconnect.',
    super.code = 'OFFLINE',
  });
}

/// Catch-all for unexpected envelopes.
class UnknownApiException extends ApiException {
  const UnknownApiException({
    required super.message,
    super.code = 'UNKNOWN',
  });
}

/// 402 SUBSCRIPTION_REQUIRED — parent paywall, not a generic error.
class SubscriptionRequiredException extends ApiException {
  const SubscriptionRequiredException({
    required super.message,
    this.studentId,
    this.amountPaise = 36500,
    super.code = 'SUBSCRIPTION_REQUIRED',
  });

  final String? studentId;

  /// Integer paise. ₹365 = 36500.
  final int amountPaise;
}

/// Nest's [ApiExceptionFilter] wraps `{ error: { code, message, details } }`.
/// Older callers also send the inner object at the top level.
Map<String, dynamic>? unwrapApiErrorBody(Object? data) {
  if (data is! Map) return null;
  final map = Map<String, dynamic>.from(data);
  final inner = map['error'];
  if (inner is Map) return Map<String, dynamic>.from(inner);
  return map;
}

int? _asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

/// Maps a Dio/HTTP status + error envelope body to a typed exception.
ApiException mapApiError({
  required int? statusCode,
  required Map<String, dynamic>? body,
  bool isNetworkError = false,
}) {
  if (isNetworkError) return const OfflineException();

  final envelope = unwrapApiErrorBody(body) ?? body;
  final code = envelope?['code'] as String? ?? 'UNKNOWN';
  final message = envelope?['message'] as String? ?? 'Request failed';
  final fieldsRaw = envelope?['fields'];
  final fields = fieldsRaw is Map
      ? fieldsRaw.map((k, v) => MapEntry(k.toString(), v.toString()))
      : null;
  final detailsRaw = envelope?['details'];
  final details = detailsRaw is Map
      ? Map<String, dynamic>.from(detailsRaw)
      : const <String, dynamic>{};

  if (statusCode == 402 || code == 'SUBSCRIPTION_REQUIRED') {
    return SubscriptionRequiredException(
      message: message,
      studentId: details['studentId'] as String?,
      amountPaise: _asInt(details['amountPaise']) ?? 36500,
    );
  }

  return switch (statusCode) {
    400 => ValidationException(message: message, fields: fields, code: code),
    401 => UnauthenticatedException(message: message, code: code),
    403 when code == 'SCOPE_VIOLATION' =>
      ScopeException(message: message, code: code),
    403 => PermissionException(message: message, code: code),
    409 => ConflictException(message: message, code: code),
    429 => RateLimitException(
        message: message,
        retryAfterSeconds: (envelope?['retryAfterSeconds'] as int?) ?? 60,
        code: code,
      ),
    _ => UnknownApiException(message: message, code: code),
  };
}


/// True when the server actively REFUSED the caller, as opposed to the request
/// never reaching it.
///
/// Offline-first repositories legitimately fall back to cached data when the
/// network is unreachable — that is the whole point of the sync architecture.
/// But a blanket `catch (_)` applies that same fallback to a 401 or 403, and
/// the user is then shown stale or placeholder data as though it were theirs.
/// That is how a student, refused by `family.child.read`, was shown a
/// fabricated child named "Your child" instead of an error.
///
/// Use as the guard on every cache fallback:
///
/// ```dart
/// try {
///   return await _api.get(...);
/// } catch (e) {
///   if (isRefusal(e)) rethrow;   // never mask a refusal with cached data
///   return cachedOr(fallback);
/// }
/// ```
bool isRefusal(Object error) =>
    error is UnauthenticatedException ||
    error is PermissionException ||
    error is ScopeException ||
    error is SubscriptionRequiredException;
