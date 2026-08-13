import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/paywall.dart';
import '../../../core/providers.dart';
import '../data/fees_repository.dart';
import '../domain/fees_model.dart';

final feesRepositoryProvider = Provider<FeesRepository>((ref) {
  return FeesRepository(ref.watch(apiClientProvider));
});

class FeesNotifier extends AsyncNotifier<FeesOverview> {
  @override
  Future<FeesOverview> build() async {
    final studentId = await ref.watch(childSwitcherProvider.future) ?? '';
    final repo = ref.watch(feesRepositoryProvider);
    final cached = await repo.getCached(studentId);
    if (cached != null) {
      unawaited(_refresh(studentId));
      return cached;
    }
    return repo.fetch(studentId);
  }

  Future<void> _refresh(String studentId) async {
    try {
      state = AsyncData(
        await ref.read(feesRepositoryProvider).fetch(studentId),
      );
    } catch (e) {
      if (isSubscriptionRequired(e)) {
        state = AsyncError(e, StackTrace.current);
      }
    }
  }

  Future<void> refresh() async {
    final studentId = await ref.read(childSwitcherProvider.future) ?? '';
    state = await AsyncValue.guard(
      () => ref.read(feesRepositoryProvider).fetch(studentId),
    );
  }
}

final feesProvider = AsyncNotifierProvider<FeesNotifier, FeesOverview>(
  FeesNotifier.new,
);
