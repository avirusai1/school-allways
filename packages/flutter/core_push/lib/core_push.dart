/// Shared FCM registration and tap routing. HTTP lives on [AuthRepository];
/// this package owns permission, token lifecycle, and the free-tier route map.
library core_push;

export 'src/push_tap.dart';
export 'src/push_token_source.dart';
export 'src/push_registration.dart';
export 'src/firebase_push_source.dart';
export 'src/push_host.dart';
