import 'package:core_push/core_push.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('absentee alert always routes to attendance, never a paid screen', () {
    final dest = resolvePushTap({
      'templateCode': 'STUDENT_ABSENT',
      'route': '/fees',
      'studentId': 'stu-locked',
    });
    expect(dest.route, '/attendance');
    expect(dest.studentId, 'stu-locked');
    expect(dest.route, isNot('/fees'));
  });

  test('announcement uses the payload route when it is a safe path', () {
    final dest = resolvePushTap({
      'templateCode': 'ANNOUNCEMENT',
      'route': '/notices',
    });
    expect(dest.route, '/notices');
  });
}
