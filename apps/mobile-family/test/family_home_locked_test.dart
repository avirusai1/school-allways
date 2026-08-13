import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_family/features/home/domain/family_home.dart';
import 'package:mobile_family/features/home/presentation/home_screen.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });
  testWidgets('locked home shows attendance only and does not crash',
      (tester) async {
    final home = FamilyHome.fromJson({
      'locked': true,
      'subscription': {'status': 'locked'},
      'student': {
        'id': 'stu-aarav',
        'firstName': 'Aarav',
        'fullName': 'Aarav Sharma',
      },
      'today': {
        'label': 'TODAY, 13 AUG',
        'day': '2026-08-13',
        'attendance': {'status': 'present', 'label': 'Present'},
        'homeworkDueCount': 0,
        'feesDuePaise': 0,
      },
      'needsAttention': [
        {
          'severity': 'red',
          'title': 'Absent yesterday',
          'route': '/attendance',
        },
      ],
    });

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.build(),
          home: Scaffold(
            body: FamilyHomeBody(
              home: home,
              onRefresh: () async {},
            ),
          ),
        ),
      ),
    );

    expect(find.text('Present'), findsOneWidget);
    expect(find.text('Attendance'), findsOneWidget);
    expect(find.text('Absent yesterday'), findsOneWidget);
    expect(find.text('Other school data is paused'), findsOneWidget);
    expect(find.text('Homework due'), findsNothing);
    expect(find.text('Recent notices'), findsNothing);
    expect(find.text('Nothing here yet'), findsNothing);
    expect(find.textContaining('cash'), findsNothing);
    expect(find.textContaining('Cash'), findsNothing);
  });
}
