import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/attendance/presentation/take_attendance_screen.dart';
import '../features/auth/presentation/email_login_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/otp_screen.dart';
import '../features/auth/presentation/select_school_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/dashboard/presentation/principal_dashboard_screen.dart';
import '../features/diary/presentation/diary_screen.dart';
import '../features/driver/presentation/driver_screens.dart';
import '../features/fees/presentation/collect_fee_screen.dart';
import '../features/gate/presentation/gate_screens.dart';
import '../features/home/presentation/teacher_home_screen.dart';
import '../features/homework/presentation/compose_homework_screen.dart';
import '../features/homework/presentation/teacher_homework_screen.dart';
import '../features/marks/presentation/marks_entry_screen.dart';
import '../features/messages/presentation/staff_messages_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import '../features/students/presentation/my_class_screen.dart';
import '../features/subscriptions/presentation/subscriptions_screen.dart';
import 'nav_registry.dart';
import 'routes.dart';

class _RouterRefresh extends ChangeNotifier {
  void ping() => notifyListeners();
}

final adminRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh();
  ref.listen(sessionProvider, (_, __) => refresh.ping());
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: AdminRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final session = ref.read(sessionProvider);
      final onAuth = loc == AdminRoutes.splash ||
          loc == AdminRoutes.login ||
          loc == AdminRoutes.otp ||
          loc == AdminRoutes.emailLogin ||
          loc == AdminRoutes.selectSchool;

      if (session.isLoading) {
        return loc == AdminRoutes.splash ? null : AdminRoutes.splash;
      }

      final signedIn = session.valueOrNull != null;
      if (!signedIn && !onAuth) return AdminRoutes.login;
      if (signedIn &&
          (loc == AdminRoutes.login ||
              loc == AdminRoutes.otp ||
              loc == AdminRoutes.emailLogin ||
              loc == AdminRoutes.splash)) {
        return AdminRoutes.home;
      }

      final auth = session.valueOrNull;
      if (auth != null && adminManifestBlocksRoute(loc, auth.navManifest)) {
        return AdminRoutes.home;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: AdminRoutes.splash,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: AdminRoutes.login,
        builder: (_, __) => const LoginScreen(),
      ),
      GoRoute(
        path: AdminRoutes.otp,
        builder: (_, __) => const OtpScreen(),
      ),
      GoRoute(
        path: AdminRoutes.emailLogin,
        builder: (_, __) => const EmailLoginScreen(),
      ),
      GoRoute(
        path: AdminRoutes.selectSchool,
        builder: (_, __) => const SelectSchoolScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return _AdminShell(shell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AdminRoutes.home,
                builder: (_, __) => const RoleHomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AdminRoutes.attendance,
                builder: (_, __) => const AttendanceHubScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AdminRoutes.myClass,
                builder: (_, __) => const MyClassScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AdminRoutes.homework,
                builder: (_, __) => const TeacherHomeworkScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AdminRoutes.more,
                builder: (_, __) => const MoreScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: AdminRoutes.takeAttendance,
        builder: (context, state) {
          final sectionId = state.uri.queryParameters['sectionId'] ?? '';
          return TakeAttendanceScreen(
            sectionId: sectionId,
            day: state.uri.queryParameters['day'],
            periodId: state.uri.queryParameters['periodId'],
          );
        },
      ),
      GoRoute(
        path: AdminRoutes.attendanceOverview,
        builder: (_, __) => const AttendanceOverviewScreen(),
      ),
      GoRoute(
        path: AdminRoutes.students,
        builder: (_, __) => const MyClassScreen(),
      ),
      GoRoute(
        path: AdminRoutes.composeHomework,
        builder: (_, __) => const ComposeHomeworkScreen(),
      ),
      GoRoute(
        path: AdminRoutes.diary,
        builder: (_, __) => const DiaryScreen(),
      ),
      GoRoute(
        path: AdminRoutes.messages,
        builder: (_, __) => const StaffMessagesScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, state) => StaffMessageThreadScreen(
              id: state.pathParameters['id']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: AdminRoutes.marksEntry,
        builder: (_, __) => const MarksEntryScreen(),
      ),
      GoRoute(
        path: AdminRoutes.timetable,
        builder: (_, __) =>
            const PlaceholderFeatureScreen(title: 'Timetable'),
      ),
      GoRoute(
        path: AdminRoutes.leave,
        builder: (_, __) => const PlaceholderFeatureScreen(title: 'Leave'),
      ),
      GoRoute(
        path: AdminRoutes.approvals,
        builder: (_, __) => const ApprovalsScreen(),
      ),
      GoRoute(
        path: AdminRoutes.gateScanner,
        builder: (_, __) => const GateScannerScreen(),
      ),
      GoRoute(
        path: AdminRoutes.verifyPickup,
        builder: (_, __) => const VerifyPickupScreen(),
      ),
      GoRoute(
        path: AdminRoutes.driverHome,
        builder: (_, __) => const DriverHomeScreen(),
      ),
      GoRoute(
        path: AdminRoutes.scanBoarding,
        builder: (_, state) => ScanBoardingScreen(
          tripId: state.extra as String?,
        ),
      ),
      GoRoute(
        path: AdminRoutes.sos,
        builder: (_, state) => SosScreen(
          tripId: state.extra as String?,
        ),
      ),
      GoRoute(
        path: AdminRoutes.settings,
        builder: (_, __) => const SettingsScreen(),
      ),
      GoRoute(
        path: AdminRoutes.collectFee,
        builder: (_, __) => const CollectFeeScreen(),
      ),
      GoRoute(
        path: AdminRoutes.subscriptions,
        builder: (_, __) => const SubscriptionsScreen(),
      ),
    ],
  );
});

class _AdminShell extends ConsumerWidget {
  const _AdminShell({required this.shell});

  final StatefulNavigationShell shell;

  static const _branchRoutes = [
    AdminRoutes.home,
    AdminRoutes.attendance,
    AdminRoutes.myClass,
    AdminRoutes.homework,
    AdminRoutes.more,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final split = splitAdminNav(
      session?.navManifest ??
          const [
            'teacher_home',
            'take_attendance',
            'my_class',
            'homework',
            'more',
          ],
    );

    final tabs = split.tabs.length == 5
        ? split.tabs
        : resolveAdminNav(const [
            'teacher_home',
            'take_attendance',
            'my_class',
            'homework',
            'more',
          ]);

    return AppScaffold(
      body: shell,
      bottomNavigationBar: AppBottomNav(
        items: [
          for (final item in tabs.take(5))
            BottomNavItem(icon: item.icon, label: item.label),
        ],
        currentIndex: shell.currentIndex.clamp(0, 4),
        onTap: (i) {
          if (i < tabs.length) {
            final route = tabs[i].route;
            final branch = _branchRoutes.indexOf(route);
            if (branch >= 0) {
              shell.goBranch(branch);
            } else if (route == AdminRoutes.more) {
              shell.goBranch(4);
            } else {
              shell.goBranch(i.clamp(0, 4));
            }
          }
        },
      ),
    );
  }
}
