import 'dart:async';

import 'package:core_auth/core_auth.dart';
import 'package:core_push/core_push.dart';
import 'package:core_sync/core_sync.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/providers.dart';
import 'core/push_handlers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    if (kReleaseMode) {
      // Wire to crash reporting in production.
    }
  };

  final db = await AppDatabase.openDefault();
  final locale = await LocaleController.create();
  final pushSource = await firebasePushSourceOverride();

  runZonedGuarded(
    () {
      runApp(
        ProviderScope(
          overrides: [
            ...coreProviderOverrides(db: db, locale: locale),
            pushSource,
          ],
          child: PushHost(
            onTap: handleFamilyPushTap,
            onForeground: showFamilyForegroundPush,
            child: const _Bootstrap(child: SchoolAllWaysApp()),
          ),
        ),
      );
    },
    (error, stack) {
      debugPrint('Uncaught: $error\n$stack');
    },
  );
}

/// Eagerly constructs outbox + registers resume → sync/status.
class _Bootstrap extends ConsumerStatefulWidget {
  const _Bootstrap({required this.child});

  final Widget child;

  @override
  ConsumerState<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends ConsumerState<_Bootstrap> {
  SyncLifecycleObserver? _lifecycle;

  @override
  void initState() {
    super.initState();
    // Touch providers so the outbox timer starts immediately.
    ref.read(outboxWorkerProvider);
    _lifecycle = SyncLifecycleObserver(ref);
    WidgetsBinding.instance.addObserver(_lifecycle!);
  }

  @override
  void dispose() {
    if (_lifecycle != null) {
      WidgetsBinding.instance.removeObserver(_lifecycle!);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
