import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/attendance/presentation/attendance_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/otp_screen.dart';
import '../features/auth/presentation/select_school_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/books/presentation/books_shelf_screen.dart';
import '../features/bus/presentation/bus_screen.dart';
import '../features/diary/presentation/diary_screen.dart';
import '../features/fees/presentation/fees_screen.dart';
import '../features/fees/presentation/invoice_detail_screen.dart';
import '../features/fees/presentation/payment_checkout_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/homework/presentation/homework_screen.dart';
import '../features/messages/presentation/messages_screen.dart';
import '../features/notices/presentation/notices_screen.dart';
import '../features/privacy/presentation/privacy_centre_screen.dart';
import '../features/results/presentation/results_screen.dart';
import '../features/settings/presentation/settings_screen.dart';
import 'nav_registry.dart';
import 'routes.dart';

/// Listenable bridge so go_router re-evaluates redirects on session change.
class _RouterRefresh extends ChangeNotifier {
  void ping() => notifyListeners();
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh();
  ref.listen(sessionProvider, (_, __) => refresh.ping());
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      final session = ref.read(sessionProvider);
      final loggingIn = loc == Routes.login ||
          loc == Routes.otp ||
          loc == Routes.selectSchool ||
          loc == Routes.splash;

      if (session.isLoading) {
        return loc == Routes.splash ? null : Routes.splash;
      }

      final signedIn = session.valueOrNull != null;
      if (!signedIn && !loggingIn) return Routes.login;
      if (signedIn &&
          (loc == Routes.login || loc == Routes.otp || loc == Routes.splash)) {
        return Routes.home;
      }

      // Server-driven nav: route present in registry but key absent → home.
      // Student mode: hide fees, messages, privacy entirely.
      final auth = session.valueOrNull;
      if (auth != null) {
        if (auth.user.kind == 'student') {
          const hidden = {
            Routes.fees,
            Routes.messages,
            Routes.privacy,
          };
          if (hidden.contains(loc) || loc.startsWith('/fees/')) {
            return Routes.home;
          }
        }
        final blocked = manifestBlocksRoute(loc, auth.navManifest);
        if (blocked) return Routes.home;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: Routes.login,
        builder: (_, __) => const LoginScreen(),
        routes: [
          GoRoute(
            path: 'otp',
            builder: (_, __) => const OtpScreen(),
          ),
        ],
      ),
      GoRoute(
        path: Routes.selectSchool,
        builder: (_, __) => const SelectSchoolScreen(),
      ),
      GoRoute(
        path: Routes.notices,
        builder: (_, __) => const NoticesScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, state) =>
                NoticeDetailScreen(id: state.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: Routes.messages,
        builder: (_, __) => const MessagesScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, state) =>
                MessageThreadScreen(id: state.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(
        path: Routes.privacy,
        builder: (_, __) => const PrivacyCentreScreen(),
      ),
      GoRoute(
        path: Routes.books,
        builder: (_, __) => const BooksShelfScreen(),
      ),
      GoRoute(
        path: Routes.results,
        builder: (_, __) => const ResultsScreen(),
      ),
      GoRoute(
        path: Routes.bus,
        builder: (_, __) => const BusScreen(),
      ),
      GoRoute(
        path: Routes.diary,
        builder: (_, __) => const DiaryScreen(),
      ),
      GoRoute(
        path: '/fees/invoices/:id',
        builder: (_, state) => InvoiceDetailScreen(
          invoiceId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/fees/pay/:id',
        builder: (_, state) {
          final extra = state.extra;
          final map = extra is Map ? Map<String, dynamic>.from(extra) : null;
          return PaymentCheckoutScreen(
            paymentId: state.pathParameters['id']!,
            amountPaise: map?['amountPaise'] as int? ?? 0,
            checkoutUrl: map?['checkoutUrl'] as String?,
          );
        },
      ),
      GoRoute(
        path: Routes.more,
        redirect: (_, __) => Routes.settings,
      ),
      GoRoute(
        path: '/homework/:id',
        builder: (_, state) =>
            HomeworkDetailScreen(id: state.pathParameters['id']!),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return _FamilyShell(shell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.home,
                builder: (_, __) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.attendance,
                builder: (_, __) => const AttendanceScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.homework,
                builder: (_, __) => const HomeworkScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.fees,
                builder: (_, __) => const FeesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.settings,
                builder: (_, __) => const SettingsScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _FamilyShell extends ConsumerWidget {
  const _FamilyShell({required this.shell});

  final StatefulNavigationShell shell;

  static const _branchRoutes = [
    Routes.home,
    Routes.attendance,
    Routes.homework,
    Routes.fees,
    Routes.settings,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final isStudent = session?.user.kind == 'student';
    final defaultManifest = isStudent
        ? studentDefaultManifest
        : const [
            'family_home',
            'attendance',
            'homework',
            'fees',
            'more',
          ];
    final resolved = resolveNav(session?.navManifest ?? defaultManifest);
    // First 4 tabs + More (build/12 §5).
    final items = resolved.length <= 5
        ? resolved
        : [...resolved.take(4), navRegistry['more']!];

    final currentRoute = _branchRoutes[shell.currentIndex.clamp(0, 4)];
    var currentIndex = items.indexWhere((i) => i.route == currentRoute);
    if (currentIndex < 0) currentIndex = 0;

    return AppScaffold(
      body: shell,
      bottomNavigationBar: AppBottomNav(
        items: [
          for (final item in items.take(5))
            BottomNavItem(icon: item.icon, label: item.label),
        ],
        currentIndex: currentIndex.clamp(0, items.length - 1),
        onTap: (i) {
          if (i >= items.length) return;
          final route = items[i].route;
          final branch = _branchRoutes.indexOf(route);
          if (branch >= 0) {
            shell.goBranch(branch);
          } else {
            context.push(route);
          }
        },
      ),
    );
  }
}
