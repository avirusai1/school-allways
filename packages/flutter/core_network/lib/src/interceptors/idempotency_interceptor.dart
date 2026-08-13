import 'package:dio/dio.dart';

/// Injects X-Client-Mutation-Id on POST/PATCH so mutations are idempotent.
/// Position 3.
class IdempotencyInterceptor extends Interceptor {
  IdempotencyInterceptor({this.idFactory});

  final String Function()? idFactory;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final method = options.method.toUpperCase();
    if (method == 'POST' || method == 'PATCH' || method == 'PUT') {
      options.headers.putIfAbsent(
        'X-Client-Mutation-Id',
        () => idFactory?.call() ?? _uuidV4ish(),
      );
    }
    handler.next(options);
  }

  String _uuidV4ish() {
    // Stub id — replace with package:uuid in production bootstrap.
    return DateTime.now().microsecondsSinceEpoch.toRadixString(16);
  }
}
