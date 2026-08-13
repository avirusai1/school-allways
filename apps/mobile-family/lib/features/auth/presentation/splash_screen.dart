import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router/routes.dart';

/// Auth gate — solid primary, wordmark, decide in < 300 ms. No spinner.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  var _opacity = 0.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _opacity = 1);
      _route();
    });
  }

  Future<void> _route() async {
    // Let the session restore race complete without showing a spinner.
    await Future<void>.delayed(AppDurations.fast);
    if (!mounted) return;

    final session = ref.read(sessionProvider);
    session.when(
      data: (s) {
        if (s == null) {
          context.go(Routes.login);
        } else {
          context.go(Routes.home);
        }
      },
      loading: () {
        // Still restoring — wait one more tick then re-check.
        Future<void>.delayed(AppDurations.instant, () {
          if (!mounted) return;
          final again = ref.read(sessionProvider);
          if (again is AsyncLoading) {
            context.go(Routes.login);
          } else {
            _route();
          }
        });
      },
      error: (_, __) => context.go(Routes.login),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.primary,
      body: Center(
        child: AnimatedOpacity(
          opacity: _opacity,
          duration: AppDurations.fast,
          child: Text(
            'School All Ways',
            style: AppTypography.h1(color: t.textOnPrimary),
          ),
        ),
      ),
    );
  }
}
