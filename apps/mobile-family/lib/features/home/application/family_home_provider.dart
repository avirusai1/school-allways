import 'dart:async';

import 'package:core_auth/core_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../data/family_home_repository.dart';
import '../domain/family_home.dart';

final sharedPreferencesProvider = FutureProvider<SharedPreferences>((ref) {
  return SharedPreferences.getInstance();
});

final familyHomeRepositoryProvider = Provider<FamilyHomeRepository>((ref) {
  // Prefer resolved prefs; FamilyHomeNotifier awaits the future before use.
  final prefs = ref.watch(sharedPreferencesProvider).asData?.value;
  if (prefs == null) {
    throw StateError('SharedPreferences not ready');
  }
  return FamilyHomeRepository(
    api: ref.watch(apiClientProvider),
    prefs: prefs,
  );
});

bool _isStudent(Ref ref) =>
    ref.read(sessionProvider).valueOrNull?.user.kind == 'student';

final childrenProvider = FutureProvider<List<ChildSummary>>((ref) async {
  // Guardian-only endpoint; a student would get a 403 and a fake demo child.
  if (_isStudent(ref)) return const <ChildSummary>[];
  return ref.watch(familyHomeRepositoryProvider).listChildren();
});

final selectedChildProvider = Provider<ChildSummary?>((ref) {
  final id = ref.watch(childSwitcherProvider).valueOrNull;
  final children = ref.watch(childrenProvider).asData?.value;
  if (id == null || children == null) return null;
  for (final child in children) {
    if (child.id == id) return child;
  }
  return null;
});

/// Offline-first home feed for the selected child.
class FamilyHomeNotifier extends AsyncNotifier<FamilyHome> {
  @override
  Future<FamilyHome> build() async {
    await ref.watch(sharedPreferencesProvider.future);

    // A student is not a guardian: no child list, no switcher, own feed.
    if (_isStudent(ref)) {
      return ref.read(familyHomeRepositoryProvider).fetchSelf();
    }

    final children = await ref.watch(childrenProvider.future);
    // Rebuild when the active child changes.
    ref.watch(childSwitcherProvider);

    final id = await ref
        .read(childSwitcherProvider.notifier)
        .ensureSelection(children.map((c) => c.id).toList());

    if (id.isEmpty) {
      return FamilyHome.empty(studentId: '', name: '');
    }

    final repo = ref.read(familyHomeRepositoryProvider);
    final cached = await repo.getCached(id);
    if (cached != null) {
      unawaited(_refresh(id));
      return cached;
    }
    return repo.fetch(id);
  }

  Future<void> _refresh(String studentId) async {
    try {
      final fresh =
          await ref.read(familyHomeRepositoryProvider).fetch(studentId);
      state = AsyncData(fresh);
    } catch (_) {
      // Keep cached state on refresh failure.
    }
  }

  Future<void> refresh() async {
    if (_isStudent(ref)) {
      state = const AsyncLoading<FamilyHome>().copyWithPrevious(state);
      state = await AsyncValue.guard(
        () => ref.read(familyHomeRepositoryProvider).fetchSelf(),
      );
      return;
    }
    final studentId = ref.read(childSwitcherProvider).valueOrNull;
    if (studentId == null || studentId.isEmpty) return;
    try {
      await ref.read(syncControllerProvider).checkStatus();
    } catch (_) {}
    state = const AsyncLoading<FamilyHome>().copyWithPrevious(state);
    state = await AsyncValue.guard(
      () => ref.read(familyHomeRepositoryProvider).fetch(studentId),
    );
  }
}

final familyHomeProvider =
    AsyncNotifierProvider<FamilyHomeNotifier, FamilyHome>(
  FamilyHomeNotifier.new,
);
