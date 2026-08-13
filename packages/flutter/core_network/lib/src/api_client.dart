import 'package:dio/dio.dart';

import 'api_exception.dart';
import 'token_refresh.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/idempotency_interceptor.dart';
import 'interceptors/tenant_interceptor.dart';

/// Thin Dio wrapper with the fixed interceptor order from build/12 §3.
class ApiClient {
  ApiClient({
    required Dio dio,
    required Future<String?> Function() tokenProvider,
    required Future<void> Function() refreshTokens,
    String Function()? localeProvider,
    String Function()? mutationIdFactory,
    bool enableLogging = false,
  })  : _dio = dio,
        _refresh = TokenRefreshCoordinator(refreshTokens) {
    /// Interceptor order matters and is fixed:
    ///   1. AuthInterceptor        attaches the bearer token
    ///   2. TenantInterceptor      attaches X-Request-Id, Accept-Language
    ///   3. IdempotencyInterceptor injects X-Client-Mutation-Id on POST/PATCH
    ///   4. RetryInterceptor       exponential backoff on 5xx and network errors
    ///   5. ErrorInterceptor       maps the error envelope to typed exceptions
    ///   6. LogInterceptor         debug builds only, redacts phone/OTP/token
    _dio.interceptors.addAll([
      AuthInterceptor(tokenProvider),
      TenantInterceptor(localeProvider: localeProvider),
      IdempotencyInterceptor(idFactory: mutationIdFactory),
      _RetryInterceptor(_dio),
      _ErrorInterceptor(
        dio: _dio,
        onUnauthorized: _refresh.refreshOnce,
      ),
      if (enableLogging)
        LogInterceptor(
          requestHeader: false,
          requestBody: false,
          responseHeader: false,
          // Redact in a real LogInterceptor subclass — stub logs status only.
          logPrint: (obj) {
            final s = obj.toString();
            if (s.contains('Authorization') ||
                s.contains('phone') ||
                s.contains('otp') ||
                s.contains('token')) {
              return;
            }
            // ignore: avoid_print
            print(s);
          },
        ),
    ]);
  }

  final Dio _dio;
  final TokenRefreshCoordinator _refresh;

  Dio get dio => _dio;
  TokenRefreshCoordinator get tokenRefresh => _refresh;

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _dio.get<T>(path, queryParameters: queryParameters, options: options);

  Future<Response<T>> post<T>(
    String path, {
    Object? data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );

  Future<Response<T>> patch<T>(
    String path, {
    Object? data,
    Options? options,
  }) =>
      _dio.patch<T>(path, data: data, options: options);

  Future<Response<T>> delete<T>(
    String path, {
    Object? data,
    Options? options,
  }) =>
      _dio.delete<T>(path, data: data, options: options);
}

/// Position 4 — exponential backoff on 5xx and transient network errors.
class _RetryInterceptor extends Interceptor {
  _RetryInterceptor(this._dio);

  final Dio _dio;
  static const _maxAttempts = 3;

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final attempt = err.requestOptions.extra['retryAttempt'] as int? ?? 0;
    final retriable = err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.connectionError ||
        (err.response?.statusCode ?? 0) >= 500;

    if (!retriable || attempt >= _maxAttempts) {
      return handler.next(err);
    }

    final delay = Duration(milliseconds: 200 * (1 << attempt));
    await Future<void>.delayed(delay);
    final opts = err.requestOptions;
    opts.extra['retryAttempt'] = attempt + 1;
    try {
      // Reuse the same Dio so auth/tenant/idempotency interceptors still run.
      final response = await _dio.fetch<dynamic>(opts);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    }
  }
}

/// Position 5 — maps envelopes to [ApiException]; single-flight refresh + retry on 401.
class _ErrorInterceptor extends Interceptor {
  _ErrorInterceptor({
    required this.dio,
    required this.onUnauthorized,
  });

  final Dio dio;
  final Future<void> Function() onUnauthorized;

  static const _retriedKey = 'retriedAfterRefresh';

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401 &&
        err.requestOptions.extra[_retriedKey] != true) {
      try {
        await onUnauthorized();
        err.requestOptions.extra[_retriedKey] = true;
        final response = await dio.fetch<dynamic>(err.requestOptions);
        return handler.resolve(response);
      } catch (_) {
        // Refresh or retry failed — fall through to typed exception.
      }
    }

    final mapped = mapApiError(
      statusCode: err.response?.statusCode,
      body: unwrapApiErrorBody(err.response?.data),
      isNetworkError: err.type == DioExceptionType.connectionError ||
          err.type == DioExceptionType.connectionTimeout ||
          err.type == DioExceptionType.unknown && err.response == null,
    );

    handler.next(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: mapped,
        message: mapped.message,
      ),
    );
  }
}
