import 'dart:async';

import 'package:core_auth/core_auth.dart';
import 'package:core_models/core_models.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'firebase_push_source.dart';
import 'push_registration.dart';
import 'push_tap.dart';
import 'push_token_source.dart';

final pushAppIdProvider = Provider<String>((ref) {
  throw UnimplementedError('Override pushAppIdProvider with family or admin');
});

final pushTokenSourceProvider = Provider<PushTokenSource>((ref) {
  return NoopPushTokenSource();
});

final pushRegistrationProvider = Provider<PushRegistration>((ref) {
  return PushRegistration(
    auth: ref.watch(authRepositoryProvider),
    source: ref.watch(pushTokenSourceProvider),
    appId: ref.watch(pushAppIdProvider),
  );
});

typedef PushTapHandler = Future<void> Function(
  WidgetRef ref,
  PushTapTarget target,
);

typedef PushForegroundHandler = void Function(
  WidgetRef ref,
  PushForegroundMessage message,
);

/// Wires session changes to token registration. Prompt only after a real
/// login, never on cold start.
class PushHost extends ConsumerStatefulWidget {
  const PushHost({
    super.key,
    required this.child,
    required this.onTap,
    this.onForeground,
  });

  final Widget child;
  final PushTapHandler onTap;
  final PushForegroundHandler? onForeground;

  @override
  ConsumerState<PushHost> createState() => _PushHostState();
}

class _PushHostState extends ConsumerState<PushHost> {
  StreamSubscription<PushTapTarget>? _tapSub;
  StreamSubscription<PushForegroundMessage>? _fgSub;
  var _listening = false;
  var _didInitial = false;

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider, (prev, next) {
      unawaited(_onSession(prev, next));
    });
    if (!_didInitial) {
      _didInitial = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        unawaited(_onSession(null, ref.read(sessionProvider)));
      });
    }
    return widget.child;
  }

  Future<void> _onSession(
    AsyncValue<AuthSession?>? prev,
    AsyncValue<AuthSession?> next,
  ) async {
    final signedIn = next.valueOrNull != null;
    if (!signedIn) return;

    final cameFromSignedOut =
        prev != null && !prev.isLoading && prev.valueOrNull == null;
    await ref
        .read(pushRegistrationProvider)
        .sync(promptIfNeeded: cameFromSignedOut);
    await _listenMessages();
  }

  Future<void> _listenMessages() async {
    if (_listening) return;
    _listening = true;
    final source = ref.read(pushTokenSourceProvider);

    final initial = await source.getInitialTap();
    if (initial != null && mounted) {
      await widget.onTap(ref, initial);
    }

    _tapSub = source.onTap.listen((target) {
      unawaited(widget.onTap(ref, target));
    });
    final onFg = widget.onForeground;
    if (onFg != null) {
      _fgSub = source.onForegroundMessage.listen((msg) => onFg(ref, msg));
    }
  }

  @override
  void dispose() {
    _tapSub?.cancel();
    _fgSub?.cancel();
    super.dispose();
  }
}

/// Production override: Firebase when `google-services.json` initialised,
/// otherwise the no-op source so debug CI without the file still runs.
Future<Override> firebasePushSourceOverride() async {
  final ok = await ensureFirebaseInitialized();
  if (!ok) {
    return pushTokenSourceProvider.overrideWithValue(NoopPushTokenSource());
  }
  return pushTokenSourceProvider.overrideWithValue(FirebasePushTokenSource());
}
