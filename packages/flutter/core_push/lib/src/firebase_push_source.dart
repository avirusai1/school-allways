import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'push_tap.dart';
import 'push_token_source.dart';

/// Returns false when `google-services.json` is missing (debug CI) so callers
/// can skip registration instead of crashing.
Future<bool> ensureFirebaseInitialized() async {
  try {
    if (Firebase.apps.isNotEmpty) return true;
    await Firebase.initializeApp();
    return true;
  } catch (err, stack) {
    debugPrint('Firebase init skipped: $err\n$stack');
    return false;
  }
}

class FirebasePushTokenSource implements PushTokenSource {
  FirebasePushTokenSource({FirebaseMessaging? messaging})
      : _messaging = messaging ?? FirebaseMessaging.instance;

  final FirebaseMessaging _messaging;

  @override
  Future<PushPermission> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return _map(settings.authorizationStatus);
  }

  @override
  Future<PushPermission> currentPermission() async {
    final settings = await _messaging.getNotificationSettings();
    return _map(settings.authorizationStatus);
  }

  @override
  Future<String?> getToken() => _messaging.getToken();

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  @override
  Stream<PushForegroundMessage> get onForegroundMessage =>
      FirebaseMessaging.onMessage.map(_foreground);

  @override
  Future<PushTapTarget?> getInitialTap() async {
    final msg = await _messaging.getInitialMessage();
    if (msg == null) return null;
    return resolvePushTap(_stringData(msg.data));
  }

  @override
  Stream<PushTapTarget> get onTap => FirebaseMessaging.onMessageOpenedApp
      .map((msg) => resolvePushTap(_stringData(msg.data)));
}

PushForegroundMessage _foreground(RemoteMessage msg) {
  return PushForegroundMessage(
    target: resolvePushTap(_stringData(msg.data)),
    title: msg.notification?.title,
    body: msg.notification?.body ?? msg.data['body'],
  );
}

Map<String, String> _stringData(Map<String, dynamic> data) {
  return {
    for (final e in data.entries) e.key: e.value?.toString() ?? '',
  };
}

PushPermission _map(AuthorizationStatus status) {
  switch (status) {
    case AuthorizationStatus.authorized:
    case AuthorizationStatus.provisional:
      return PushPermission.granted;
    case AuthorizationStatus.denied:
      return PushPermission.denied;
    case AuthorizationStatus.notDetermined:
      return PushPermission.notDetermined;
  }
}
