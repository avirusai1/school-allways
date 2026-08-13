import 'dart:math';

import 'package:dio/dio.dart';

/// Attaches X-Request-Id and Accept-Language. Position 2.
///
/// Tenant id comes from the verified JWT — NEVER from a header the client
/// invents. We only send correlation + locale here.
class TenantInterceptor extends Interceptor {
  TenantInterceptor({this.localeProvider});

  final String Function()? localeProvider;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers.putIfAbsent(
      'X-Request-Id',
      () => _requestId(),
    );
    final locale = localeProvider?.call();
    if (locale != null) {
      options.headers['Accept-Language'] = locale;
    }
    handler.next(options);
  }

  String _requestId() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }
}
