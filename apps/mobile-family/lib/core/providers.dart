import 'dart:async';

import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:core_push/core_push.dart';
import 'package:core_sync/core_sync.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'subscription_required_interceptor.dart';

/// Default points at the Android emulator host loopback.
/// Override at build time: `--dart-define=API_BASE_URL=https://...`
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000/v1',
);

final dioProvider = Provider<Dio>((ref) {
  return Dio(
    BaseOptions(
      baseUrl: kApiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: const {'Content-Type': 'application/json'},
    ),
  );
});

/// Override in bootstrap with [AppDatabase.openDefault].
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('Override appDatabaseProvider in bootstrap');
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final tokens = ref.watch(tokenStoreProvider);
  final locale = ref.watch(localeProvider);
  final client = ApiClient(
    dio: ref.watch(dioProvider),
    tokenProvider: tokens.readAccessToken,
    refreshTokens: () => ref.read(authRepositoryProvider).refreshTokens(),
    localeProvider: () => locale,
    enableLogging: true,
  );
  client.dio.interceptors.add(SubscriptionRequiredInterceptor());
  return client;
});

final outboxWorkerProvider = Provider<OutboxWorker>((ref) {
  final worker = OutboxWorker(
    db: ref.watch(appDatabaseProvider),
    api: ref.watch(apiClientProvider),
  );
  worker.start();
  ref.onDispose(worker.dispose);
  return worker;
});

final syncControllerProvider = Provider<SyncController>((ref) {
  return SyncController(
    db: ref.watch(appDatabaseProvider),
    api: ref.watch(apiClientProvider),
  );
});

/// Resume → cheap /sync/status; also kick the outbox.
class SyncLifecycleObserver extends WidgetsBindingObserver {
  SyncLifecycleObserver(this._ref);

  final WidgetRef _ref;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_onResume());
    }
  }

  Future<void> _onResume() async {
    try {
      await _ref.read(syncControllerProvider).checkStatus();
    } catch (_) {
      // Offline or unsigned — status check is best-effort.
    }
    unawaited(_ref.read(outboxWorkerProvider).flush());
  }
}

final scaffoldMessengerKeyProvider =
    Provider<GlobalKey<ScaffoldMessengerState>>(
  (ref) => GlobalKey<ScaffoldMessengerState>(),
);

AuthRepository createAuthRepository(Ref ref) {
  return AuthRepository(
    api: ref.watch(apiClientProvider),
    tokenStore: ref.watch(tokenStoreProvider),
  );
}

List<Override> coreProviderOverrides({
  required AppDatabase db,
  required LocaleController locale,
}) =>
    [
      appDatabaseProvider.overrideWithValue(db),
      localeControllerProvider.overrideWith((_) => locale),
      authRepositoryProvider.overrideWith(createAuthRepository),
      pushAppIdProvider.overrideWithValue('family'),
    ];