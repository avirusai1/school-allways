import 'package:dio/dio.dart';

/// Attaches the bearer access token. Position 1 in the interceptor chain.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._tokenProvider);

  final Future<String?> Function() _tokenProvider;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _tokenProvider();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}
