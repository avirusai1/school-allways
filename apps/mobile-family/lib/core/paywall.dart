import 'package:core_network/core_network.dart';
import 'package:dio/dio.dart';

/// Pulls a typed 402 out of Riverpod/Dio error objects.
SubscriptionRequiredException? subscriptionRequiredOf(Object? error) {
  if (error is SubscriptionRequiredException) return error;
  if (error is DioException) {
    final inner = error.error;
    if (inner is SubscriptionRequiredException) return inner;
    if (error.response?.statusCode == 402) {
      final mapped = mapApiError(
        statusCode: 402,
        body: unwrapApiErrorBody(error.response?.data),
      );
      if (mapped is SubscriptionRequiredException) return mapped;
    }
  }
  if (error is ApiException && error.code == 'SUBSCRIPTION_REQUIRED') {
    return SubscriptionRequiredException(message: error.message);
  }
  return null;
}

bool isSubscriptionRequired(Object? error) =>
    subscriptionRequiredOf(error) != null;
