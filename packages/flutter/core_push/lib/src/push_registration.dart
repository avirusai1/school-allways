import 'dart:async';
import 'dart:io';

import 'package:core_auth/core_auth.dart';
import 'package:flutter/foundation.dart';

import 'push_token_source.dart';

/// Requests permission (when asked), registers the FCM token with the API,
/// and re-registers when FCM rotates it. A refused permission is not an error.
class PushRegistration {
  PushRegistration({
    required AuthRepository auth,
    required PushTokenSource source,
    required String appId,
    String? platform,
  })  : _auth = auth,
        _source = source,
        _appId = appId,
        _platform = platform ?? _detectPlatform();

  final AuthRepository _auth;
  final PushTokenSource _source;
  final String _appId;
  final String _platform;

  String? _token;
  StreamSubscription<String>? _refreshSub;
  var _started = false;

  String? get currentToken => _token;

  /// [promptIfNeeded] is true after a fresh login, false on cold-start restore
  /// so we do not greet the parent with a permission dialog.
  Future<void> sync({required bool promptIfNeeded}) async {
    try {
      final permitted = await _ensurePermission(promptIfNeeded);
      if (!permitted) return;

      final token = await _source.getToken();
      if (token == null || token.isEmpty) return;
      await _register(token);
      _listenRefresh();
    } catch (err) {
      debugPrint('Push registration skipped: $err');
    }
  }

  Future<void> unregister() async {
    _refreshSub?.cancel();
    _refreshSub = null;
    _started = false;
    final token = _token;
    _token = null;
    if (token == null || token.isEmpty) return;
    try {
      await _auth.unregisterDeviceToken(token);
    } catch (err) {
      debugPrint('Push unregister skipped: $err');
    }
  }

  Future<bool> _ensurePermission(bool promptIfNeeded) async {
    final current = await _source.currentPermission();
    if (current == PushPermission.granted) return true;
    if (current == PushPermission.denied) return false;
    if (!promptIfNeeded) return false;
    final asked = await _source.requestPermission();
    return asked == PushPermission.granted;
  }

  void _listenRefresh() {
    if (_started) return;
    _started = true;
    _refreshSub = _source.onTokenRefresh.listen((token) {
      unawaited(_register(token));
    });
  }

  Future<void> _register(String token) async {
    _token = token;
    await _auth.registerDeviceToken(
      fcmToken: token,
      platform: _platform,
      appId: _appId,
    );
  }
}

String _detectPlatform() {
  if (Platform.isIOS) return 'ios';
  if (Platform.isAndroid) return 'android';
  return 'android';
}
