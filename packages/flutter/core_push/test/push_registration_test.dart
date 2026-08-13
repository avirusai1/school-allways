import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:core_push/core_push.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('sync POSTs the token after permission is granted', () async {
    final source = FakePushTokenSource(
      permission: PushPermission.granted,
      token: 'fcm-token-1',
    );
    final api = RecordingAuthApi();
    final reg = PushRegistration(
      auth: api.repo,
      source: source,
      appId: 'family',
      platform: 'android',
    );

    await reg.sync(promptIfNeeded: true);

    expect(api.registered, [
      {
        'fcmToken': 'fcm-token-1',
        'platform': 'android',
        'appId': 'family',
      },
    ]);
    expect(source.permissionPrompts, 0);
  });

  test('cold start does not prompt when permission is undetermined', () async {
    final source = FakePushTokenSource(
      permission: PushPermission.notDetermined,
      token: 'fcm-token-1',
    );
    final api = RecordingAuthApi();
    final reg = PushRegistration(
      auth: api.repo,
      source: source,
      appId: 'family',
      platform: 'android',
    );

    await reg.sync(promptIfNeeded: false);

    expect(source.permissionPrompts, 0);
    expect(api.registered, isEmpty);
  });

  test('refused permission is not an error and does not POST', () async {
    final source = FakePushTokenSource(
      permission: PushPermission.denied,
      token: 'fcm-token-1',
    );
    final api = RecordingAuthApi();
    final reg = PushRegistration(
      auth: api.repo,
      source: source,
      appId: 'admin',
      platform: 'android',
    );

    await reg.sync(promptIfNeeded: true);
    expect(api.registered, isEmpty);
  });

  test('unregister DELETEs the current token', () async {
    final source = FakePushTokenSource(
      permission: PushPermission.granted,
      token: 'fcm-token-1',
    );
    final api = RecordingAuthApi();
    final reg = PushRegistration(
      auth: api.repo,
      source: source,
      appId: 'family',
      platform: 'android',
    );

    await reg.sync(promptIfNeeded: true);
    await reg.unregister();
    expect(api.unregistered, ['fcm-token-1']);
  });
}

class FakePushTokenSource implements PushTokenSource {
  FakePushTokenSource({
    required this.permission,
    required this.token,
  });

  PushPermission permission;
  String? token;
  var permissionPrompts = 0;

  @override
  Future<PushPermission> requestPermission() async {
    permissionPrompts += 1;
    return permission;
  }

  @override
  Future<PushPermission> currentPermission() async => permission;

  @override
  Future<String?> getToken() async => token;

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  Stream<PushForegroundMessage> get onForegroundMessage => const Stream.empty();

  @override
  Future<PushTapTarget?> getInitialTap() async => null;

  @override
  Stream<PushTapTarget> get onTap => const Stream.empty();
}

class RecordingAuthApi {
  RecordingAuthApi() {
    final dio = Dio(BaseOptions(baseUrl: 'http://example.test/v1'));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (options.method == 'POST' &&
              options.path.contains('/auth/device-token')) {
            registered.add(Map<String, dynamic>.from(options.data as Map));
            handler.resolve(
              Response(requestOptions: options, statusCode: 200, data: {}),
            );
            return;
          }
          if (options.method == 'DELETE' &&
              options.path.contains('/auth/device-token')) {
            unregistered.add(
              (options.data as Map)['fcmToken'] as String,
            );
            handler.resolve(
              Response(requestOptions: options, statusCode: 204, data: null),
            );
            return;
          }
          handler.next(options);
        },
      ),
    );
    repo = AuthRepository(
      api: ApiClient(
        dio: dio,
        tokenProvider: () async => 'access',
        refreshTokens: () async {},
      ),
      tokenStore: TokenStore(),
    );
  }

  late final AuthRepository repo;
  final registered = <Map<String, dynamic>>[];
  final unregistered = <String>[];
}
