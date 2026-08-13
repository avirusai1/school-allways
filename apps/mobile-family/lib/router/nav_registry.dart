import 'package:flutter/widgets.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import 'routes.dart';

class NavItem {
  const NavItem(this.route, this.label, this.icon);

  final String route;
  final String label;
  final IconData icon;
}

/// Maps a manifest key from GET /auth/session to a route + tab metadata.
/// Unknown keys from a newer server are SKIPPED SILENTLY.
const navRegistry = <String, NavItem>{
  'family_home': NavItem(Routes.home, 'Home', PhosphorIconsRegular.house),
  'attendance':
      NavItem(Routes.attendance, 'Attendance', PhosphorIconsRegular.checkSquare),
  'homework':
      NavItem(Routes.homework, 'Homework', PhosphorIconsRegular.notebook),
  'diary': NavItem(Routes.diary, 'Diary', PhosphorIconsRegular.bookOpen),
  'fees': NavItem(Routes.fees, 'Fees', PhosphorIconsRegular.currencyInr),
  'books': NavItem(Routes.books, 'Books', PhosphorIconsRegular.bookOpen),
  'results': NavItem(Routes.results, 'Results', PhosphorIconsRegular.exam),
  'bus': NavItem(Routes.bus, 'Bus', PhosphorIconsRegular.bus),
  'more': NavItem(Routes.settings, 'More', PhosphorIconsRegular.dotsThreeOutline),
  'notices': NavItem(Routes.notices, 'Notices', PhosphorIconsRegular.megaphone),
  'messages':
      NavItem(Routes.messages, 'Messages', PhosphorIconsRegular.chatCircle),
  'settings':
      NavItem(Routes.settings, 'Settings', PhosphorIconsRegular.gear),
  'timetable': NavItem(Routes.home, 'Timetable', PhosphorIconsRegular.calendar),
};

/// Student-mode default tabs (build/13 §18) — fees/messages/pickup/privacy hidden.
const studentDefaultManifest = [
  'family_home',
  'timetable',
  'homework',
  'results',
  'books',
];

/// Resolve server-driven nav. Old clients never crash on unknown keys.
List<NavItem> resolveNav(List<String> manifest) =>
    manifest.map((k) => navRegistry[k]).nonNulls.toList();

/// True when [location] is a registry route whose manifest key(s) are absent.
bool manifestBlocksRoute(String location, List<String> manifest) {
  final keysForRoute = navRegistry.entries
      .where((e) => e.value.route == location)
      .map((e) => e.key)
      .toList();
  if (keysForRoute.isEmpty) return false;
  final allowed = manifest.toSet();
  return !keysForRoute.any(allowed.contains);
}