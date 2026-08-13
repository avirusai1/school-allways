import 'push_tap.dart';

/// Permission + token + message streams. Tests inject a fake; production
/// uses [FirebasePushTokenSource].
abstract class PushTokenSource {
  Future<PushPermission> requestPermission();

  Future<PushPermission> currentPermission();

  Future<String?> getToken();

  Stream<String> get onTokenRefresh;

  Stream<PushForegroundMessage> get onForegroundMessage;

  Future<PushTapTarget?> getInitialTap();

  Stream<PushTapTarget> get onTap;
}

enum PushPermission {
  granted,
  denied,
  notDetermined,
}

class NoopPushTokenSource implements PushTokenSource {
  @override
  Future<PushPermission> requestPermission() async => PushPermission.denied;

  @override
  Future<PushPermission> currentPermission() async => PushPermission.denied;

  @override
  Future<String?> getToken() async => null;

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Stream<PushForegroundMessage> get onForegroundMessage => const Stream.empty();

  @override
  Future<PushTapTarget?> getInitialTap() async => null;

  @override
  Stream<PushTapTarget> get onTap => const Stream.empty();
}
