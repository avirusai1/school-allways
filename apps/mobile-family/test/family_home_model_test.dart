import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_family/features/home/domain/family_home.dart';

void main() {
  test('FamilyHome.fromJson parses API home payload', () {
    final home = FamilyHome.fromJson({
      'student': {
        'id': 'stu-1',
        'firstName': 'Aarav',
        'lastName': 'Sharma',
        'fullName': 'Aarav Sharma',
      },
      'today': {
        'label': 'TODAY, 10 AUG',
        'day': '2026-08-10',
        'attendance': {'status': 'present', 'label': 'Present'},
        'homeworkDueCount': 2,
        'feesDuePaise': 0,
      },
      'needsAttention': [
        {
          'severity': 'red',
          'title': 'Fee overdue',
          'route': '/fees',
        },
      ],
      'homeworkDue': [
        {
          'id': 'hw-1',
          'title': 'Fractions',
          'dueOn': '2026-08-10',
          'dueToday': true,
        },
      ],
      'notices': [
        {
          'id': 'n-1',
          'title': 'PTM',
          'preview': 'Book your slot',
          'unread': true,
        },
      ],
      'bus': null,
      'latestPhotos': <Map<String, dynamic>>[],
    });

    expect(home.student.fullName, 'Aarav Sharma');
    expect(home.today.attendanceLabel, 'Present');
    expect(home.homeworkDue, hasLength(1));
    expect(home.needsAttention.first.severity, 'red');
    expect(home.notices.first.unread, isTrue);
    expect(home.locked, isFalse);
    expect(home.status, isNull);
  });

  test('FamilyHome.fromJson parses locked home without homework or notices', () {
    final home = FamilyHome.fromJson({
      'locked': true,
      'subscription': {
        'status': 'locked',
        'expiresAt': null,
        'graceEndsAt': null,
      },
      'student': {
        'id': 'stu-aarav',
        'firstName': 'Aarav',
        'lastName': 'Sharma',
        'fullName': 'Aarav Sharma',
      },
      'today': {
        'label': 'TODAY, 13 AUG',
        'day': '2026-08-13',
        'attendance': {'status': 'present', 'label': 'Present'},
        'homeworkDueCount': 0,
        'feesDuePaise': 0,
      },
      'bus': null,
      'needsAttention': [
        {
          'severity': 'red',
          'title': 'Absent yesterday',
          'route': '/attendance',
        },
      ],
    });

    expect(home.locked, isTrue);
    expect(home.status, 'locked');
    expect(home.today.attendanceLabel, 'Present');
    expect(home.homeworkDue, isEmpty);
    expect(home.notices, isEmpty);
    expect(home.isQuiet, isFalse);
  });

  test('ChildSummary parses subscribed and locked status', () {
    final locked = ChildSummary.fromJson({
      'id': 'stu-1',
      'fullName': 'Aarav Sharma',
      'firstName': 'Aarav',
      'subscribed': false,
      'status': 'locked',
    });
    expect(locked.isLocked, isTrue);

    final grace = ChildSummary.fromJson({
      'id': 'stu-2',
      'fullName': 'Diya',
      'subscribed': true,
      'status': 'grace',
    });
    expect(grace.isLocked, isFalse);
  });
}
