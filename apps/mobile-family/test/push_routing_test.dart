import 'package:core_push/core_push.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_family/features/paywall/presentation/paywall_panel.dart';
import 'package:mobile_family/router/routes.dart';

/// Routes whose screens wrap errors in [PaywallOrError] / [GatedPaywallOrError].
/// Attendance is deliberately not in this set — it is free-tier.
const _paywalledFamilyRoutes = {
  Routes.fees,
  Routes.homework,
  Routes.diary,
  Routes.books,
  Routes.results,
  Routes.bus,
};

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  test('absentee payload for a locked child routes to attendance, not fees', () {
    final dest = resolvePushTap({
      'templateCode': 'STUDENT_ABSENT',
      'route': '/fees',
      'studentId': 'stu-locked',
    });

    expect(dest.route, Routes.attendance);
    expect(dest.studentId, 'stu-locked');
    expect(_paywalledFamilyRoutes.contains(dest.route), isFalse);
  });

  testWidgets(
    'following an absentee tap builds the attendance surface, not the paywall',
    (tester) async {
      final dest = resolvePushTap({
        'templateCode': 'STUDENT_ABSENT',
        'route': '/fees',
        'studentId': 'stu-locked',
      });

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.build(),
          home: Scaffold(
            body: dest.route == Routes.attendance
                ? ErrorState(
                    message: 'Could not load attendance.',
                    onRetry: () {},
                  )
                : PaywallOrError(
                    error: Exception('should not render'),
                    studentName: 'Aarav',
                    onRetry: () {},
                    fallbackMessage: 'Could not load fees.',
                  ),
          ),
        ),
      );

      expect(find.text('Could not load attendance.'), findsOneWidget);
      expect(find.textContaining('unlocks once'), findsNothing);
      expect(find.text('Subscribe — coming soon'), findsNothing);
    },
  );
}
