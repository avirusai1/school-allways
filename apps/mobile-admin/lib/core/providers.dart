import 'dart:async';

import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:core_push/core_push.dart';
import 'package:core_sync/core_sync.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  throw UnimplementedError('Override appDatabaseProvider in bootstrap');
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final tokens = ref.watch(tokenStoreProvider);
  final locale = ref.watch(localeProvider);
  return ApiClient(
    dio: ref.watch(dioProvider),
    tokenProvider: tokens.readAccessToken,
    refreshTokens: () => ref.read(authRepositoryProvider).refreshTokens(),
    localeProvider: () => locale,
    enableLogging: true,
  );
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
    } catch (_) {}
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
      localeControllerProvider.overrideWith((ref) => locale),
      authRepositoryProvider.overrideWith(createAuthRepository),
      pushAppIdProvider.overrideWithValue('admin'),
    ];
