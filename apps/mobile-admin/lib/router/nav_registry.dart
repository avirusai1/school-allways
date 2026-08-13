import 'package:flutter/widgets.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import 'routes.dart';

class NavItem {
  const NavItem(this.route, this.label, this.icon);

  final String route;
  final String label;
  final IconData icon;
}

/// Server navManifest keys → route metadata. Unknown keys are skipped silently.
const adminNavRegistry = <String, NavItem>{
  'teacher_home': NavItem(AdminRoutes.home, 'Home', PhosphorIconsRegular.house),
  'principal_dashboard':
      NavItem(AdminRoutes.home, 'Home', PhosphorIconsRegular.house),
  'coordinator_dashboard':
      NavItem(AdminRoutes.home, 'Home', PhosphorIconsRegular.house),
  'admin_dashboard':
      NavItem(AdminRoutes.home, 'Home', PhosphorIconsRegular.house),
  'front_office':
      NavItem(AdminRoutes.home, 'Home', PhosphorIconsRegular.house),
  'finance_dashboard':
      NavItem(AdminRoutes.home, 'Home', PhosphorIconsRegular.currencyInr),
  'fee_counter':
      NavItem(AdminRoutes.home, 'Fees', PhosphorIconsRegular.currencyInr),
  'driver_home':
      NavItem(AdminRoutes.driverHome, 'Route', PhosphorIconsRegular.bus),
  'gate_scanner':
      NavItem(AdminRoutes.gateScanner, 'Gate', PhosphorIconsRegular.qrCode),
  'take_attendance': NavItem(
    AdminRoutes.attendance,
    'Attendance',
    PhosphorIconsRegular.checkSquare,
  ),
  'attendance_overview': NavItem(
    AdminRoutes.attendanceOverview,
    'Overview',
    PhosphorIconsRegular.squaresFour,
  ),
  'my_class':
      NavItem(AdminRoutes.myClass, 'Class', PhosphorIconsRegular.student),
  'students':
      NavItem(AdminRoutes.students, 'Students', PhosphorIconsRegular.student),
  'students.subscriptions': NavItem(
    AdminRoutes.subscriptions,
    'Subscriptions',
    PhosphorIconsRegular.creditCard,
  ),
  'homework':
      NavItem(AdminRoutes.homework, 'Homework', PhosphorIconsRegular.notebook),
  'diary': NavItem(AdminRoutes.diary, 'Diary', PhosphorIconsRegular.bookOpen),
  'marks_entry':
      NavItem(AdminRoutes.marksEntry, 'Marks', PhosphorIconsRegular.exam),
  'messages':
      NavItem(AdminRoutes.messages, 'Messages', PhosphorIconsRegular.chatCircle),
  'timetable':
      NavItem(AdminRoutes.timetable, 'Timetable', PhosphorIconsRegular.calendar),
  'leave': NavItem(AdminRoutes.leave, 'Leave', PhosphorIconsRegular.airplane),
  'approvals':
      NavItem(AdminRoutes.approvals, 'Approvals', PhosphorIconsRegular.checks),
  'more': NavItem(AdminRoutes.more, 'More', PhosphorIconsRegular.dotsThreeOutline),
  'settings':
      NavItem(AdminRoutes.settings, 'Settings', PhosphorIconsRegular.gear),
};

List<NavItem> resolveAdminNav(List<String> manifest) =>
    manifest.map((k) => adminNavRegistry[k]).nonNulls.toList();

/// True when [location] is a registry route whose manifest key(s) are absent.
bool adminManifestBlocksRoute(String location, List<String> manifest) {
  final keysForRoute = adminNavRegistry.entries
      .where((e) => e.value.route == location)
      .map((e) => e.key)
      .toList();
  if (keysForRoute.isEmpty) return false;
  final allowed = manifest.toSet();
  return !keysForRoute.any(allowed.contains);
}
/// Bottom nav = first 4 unique routes from manifest + More for the rest.
({List<NavItem> tabs, List<NavItem> overflow}) splitAdminNav(
  List<String> manifest,
) {
  final resolved = resolveAdminNav(manifest);
  final seen = <String>{};
  final unique = <NavItem>[];
  for (final item in resolved) {
    if (seen.add(item.route)) unique.add(item);
  }

  if (unique.isEmpty) {
    return (
      tabs: resolveAdminNav(const [
        'teacher_home',
        'take_attendance',
        'my_class',
        'more',
      ]),
      overflow: const [],
    );
  }

  if (unique.length <= 5) {
    return (tabs: unique, overflow: const []);
  }

  final tabs = unique.take(4).toList();
  final overflow = unique.skip(4).toList();
  tabs.add(
    const NavItem(AdminRoutes.more, 'More', PhosphorIconsRegular.dotsThreeOutline),
  );
  return (tabs: tabs, overflow: overflow);
}
