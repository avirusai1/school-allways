import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router/routes.dart';

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
    await Future<void>.delayed(const Duration(milliseconds: 160));
    if (!mounted) return;
    final session = ref.read(sessionProvider);
    session.when(
      data: (s) {
        if (s == null) {
          context.go(AdminRoutes.login);
        } else {
          context.go(AdminRoutes.home);
        }
      },
      loading: () {
        Future<void>.delayed(const Duration(milliseconds: 100), () {
          if (!mounted) return;
          if (ref.read(sessionProvider) is AsyncLoading) {
            context.go(AdminRoutes.login);
          } else {
            _route();
          }
        });
      },
      error: (_, __) => context.go(AdminRoutes.login),
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
          duration: const Duration(milliseconds: 160),
          child: Text(
            'School All Ways',
            style: AppTypography.h1(color: t.textOnPrimary),
          ),
        ),
      ),
    );
  }
}
