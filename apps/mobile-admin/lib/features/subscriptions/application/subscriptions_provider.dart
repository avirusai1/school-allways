import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/subscriptions_repository.dart';
import '../domain/subscription_models.dart';

final subscriptionsRepositoryProvider = Provider<SubscriptionsRepository>((ref) {
  return SubscriptionsRepository(ref.watch(apiClientProvider));
});

final subscriptionQueryProvider = StateProvider<String>((ref) => '');

class SubscriptionSelection extends Notifier<Set<String>> {
  @override
  Set<String> build() => {};

  void toggle(String id) {
    final next = {...state};
    if (!next.add(id)) next.remove(id);
    state = next;
  }

  void selectAll(Iterable<String> ids) => state = ids.toSet();

  void clear() => state = {};
}

final subscriptionSelectionProvider =
    NotifierProvider<SubscriptionSelection, Set<String>>(
  SubscriptionSelection.new,
);

final subscriptionListProvider =
    FutureProvider.autoDispose<SubscriptionList>((ref) {
  final q = ref.watch(subscriptionQueryProvider);
  return ref.watch(subscriptionsRepositoryProvider).list(q: q);
});

/// Stay Connected Fee is `tenant.settings.manage` — school_admin / principal.
/// A 403 is not an error state on this screen; the card simply hides.
final stayConnectedProvider =
    FutureProvider.autoDispose<StayConnectedStatus?>((ref) async {
  final session = ref.watch(sessionProvider).valueOrNull;
  if (session == null ||
      !session.permissions.contains('tenant.settings.manage')) {
    return null;
  }
  try {
    return await ref.watch(subscriptionsRepositoryProvider).stayConnected();
  } on DioException catch (e) {
    if (e.error is PermissionException) return null;
    rethrow;
  }
});
