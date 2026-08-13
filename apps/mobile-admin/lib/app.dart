import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/app_localizations.dart';
import 'core/providers.dart';
import 'router/app_router.dart';

class SchoolAllWaysAdminApp extends ConsumerWidget {
  const SchoolAllWaysAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(adminRouterProvider);
    final session = ref.watch(sessionProvider).valueOrNull;
    final localeCode = ref.watch(localeProvider);
    final primary = _parseHex(session?.tenant.primaryColor);

    return MaterialApp.router(
      title: 'School All Ways Admin',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.build(primary),
      locale: Locale(localeCode),
      scaffoldMessengerKey: ref.watch(scaffoldMessengerKeyProvider),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: (context, child) => MediaQuery.withClampedTextScaling(
        minScaleFactor: 1.0,
        maxScaleFactor: 2.0,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }

  Color? _parseHex(String? hex) {
    if (hex == null || hex.isEmpty) return null;
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length != 6) return null;
    return Color(int.parse('FF$cleaned', radix: 16));
  }
}
