import 'package:core_network/core_network.dart';
import 'package:dio/dio.dart';

/// Family-app interceptor: HTTP 402 with SUBSCRIPTION_REQUIRED becomes a
/// typed [SubscriptionRequiredException] so screens can render the paywall
/// instead of a generic error toast.
///
/// Added after [ApiClient] construction. Dio runs onError last-added-first,
/// so this sees the raw 402 before [_ErrorInterceptor] remaps it.
class SubscriptionRequiredInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.error is SubscriptionRequiredException) {
      handler.next(err);
      return;
    }
    if (err.response?.statusCode != 402) {
      handler.next(err);
      return;
    }
    final mapped = mapApiError(
      statusCode: 402,
      body: unwrapApiErrorBody(err.response?.data),
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
