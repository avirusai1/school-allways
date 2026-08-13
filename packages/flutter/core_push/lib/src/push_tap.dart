/// Where a notification tap should land, derived only from the FCM `data` map.
class PushTapTarget {
  const PushTapTarget({
    required this.route,
    required this.templateCode,
    this.studentId,
  });

  final String route;
  final String templateCode;
  final String? studentId;
}

/// Maps an FCM data payload to a screen.
///
/// [STUDENT_ABSENT] always returns `/attendance`, even if the payload's
/// `route` points at a paid screen. That alert is inside the unpaid parent's
/// free tier; sending a worried parent to the paywall would be the worst
/// possible moment to ask for money.
PushTapTarget resolvePushTap(Map<String, String> data) {
  final code = data['templateCode'] ?? '';
  final studentId = _nonEmpty(data['studentId']);

  if (code == 'STUDENT_ABSENT') {
    return PushTapTarget(
      route: '/attendance',
      templateCode: code,
      studentId: studentId,
    );
  }

  final route = data['route'];
  if (route != null &&
      route.startsWith('/') &&
      !route.contains('://') &&
      route != '/fees') {
    return PushTapTarget(
      route: route,
      templateCode: code,
      studentId: studentId,
    );
  }

  return PushTapTarget(
    route: '/home',
    templateCode: code,
    studentId: studentId,
  );
}

class PushForegroundMessage {
  const PushForegroundMessage({
    required this.target,
    this.title,
    this.body,
  });

  final PushTapTarget target;
  final String? title;
  final String? body;
}

String? _nonEmpty(String? value) {
  if (value == null || value.isEmpty) return null;
  return value;
}
