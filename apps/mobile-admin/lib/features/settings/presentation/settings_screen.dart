import 'package:core_auth/core_auth.dart';
import 'package:core_push/core_push.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/nav_registry.dart';
import '../../../router/routes.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key, this.overflow = const []});

  final List<NavItem> overflow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final session = ref.watch(sessionProvider).valueOrNull;
    final items = overflow.isNotEmpty
        ? overflow
        : resolveAdminNav(session?.navManifest ?? const []);

    return Column(
      children: [
        const SawAppBar(title: 'More'),
        Expanded(
          child: ListView(
            children: [
              for (final item in items)
                if (item.route != AdminRoutes.more &&
                    item.route != AdminRoutes.home)
                  AppListTile(
                    leading: Icon(item.icon, color: t.primary),
                    title: item.label,
                    showChevron: true,
                    onTap: () => context.push(item.route),
                  ),
              AppListTile(
                leading: Icon(PhosphorIconsRegular.gear, color: t.primary),
                title: 'Settings',
                showChevron: true,
                onTap: () => context.push(AdminRoutes.settings),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final session = ref.watch(sessionProvider).valueOrNull;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Settings'),
      body: ListView(
        children: [
          if (session != null)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: Row(
                children: [
                  AppAvatar(
                    imageUrl: session.user.photoUrl,
                    initials: session.user.fullName.isNotEmpty
                        ? session.user.fullName[0]
                        : '?',
                    size: 48,
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          session.user.fullName,
                          style: AppTypography.bodyMedium(color: t.textPrimary),
                        ),
                        Text(
                          session.tenant.name,
                          style: AppTypography.bodySmall(color: t.textTertiary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          AppListTile(
            title: 'About',
            subtitle: 'School All Ways Admin 0.1.0',
          ),
          AppListTile(
            title: 'Language',
            subtitle: ref.watch(localeProvider) == 'hi' ? 'हिन्दी' : 'English',
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: () => ref
                      .read(localeControllerProvider.notifier)
                      .setLocale('en'),
                  child: const Text('EN'),
                ),
                TextButton(
                  onPressed: () => ref
                      .read(localeControllerProvider.notifier)
                      .setLocale('hi'),
                  child: const Text('हिं'),
                ),
              ],
            ),
          ),
          AppListTile(
            title: 'Sync now',
            subtitle: 'Pull latest updates',
            onTap: () async {
              try {
                await ref.read(syncControllerProvider).pull();
              } catch (_) {}
            },
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.s4),
            child: AppButton(
              label: 'Log out',
              variant: AppButtonVariant.danger,
              expanded: true,
              onPressed: () async {
                await ref.read(pushRegistrationProvider).unregister();
                await ref.read(sessionProvider.notifier).signOut();
                if (context.mounted) context.go(AdminRoutes.login);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class PlaceholderFeatureScreen extends StatelessWidget {
  const PlaceholderFeatureScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SawAppBar(title: title),
        Expanded(
          child: EmptyState(
            icon: PhosphorIconsRegular.tray,
            headline: title,
            body: 'This staff feature lands in a later pass.',
          ),
        ),
      ],
    );
  }
}
