import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../router/nav_registry.dart';
import '../../../router/routes.dart';

/// Home for a role whose dedicated screen does not exist on mobile yet.
///
/// Thirteen of the twenty-six admin roles — librarian, school nurse, payroll
/// officer, store keeper, security head and others — declare a `homeScreen`
/// that no widget implements. RoleHomeScreen's default branch used to fall
/// through to [TeacherHomeScreen], so they opened "Today's classes" with
/// Take attendance / Post homework actions that had nothing to do with their
/// job, and nothing ever surfaced that as wrong.
///
/// This says plainly what is missing and hands the user the destinations their
/// own manifest actually grants, so the account stays usable in the meantime.
class RoleHomeFallbackScreen extends ConsumerWidget {
  const RoleHomeFallbackScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final session = ref.watch(sessionProvider).valueOrNull;
    final roleName = session?.roles.isNotEmpty == true
        ? session!.roles.first.name
        : 'Your role';

    // Everything their manifest grants, minus this screen itself.
    final destinations = resolveAdminNav(session?.navManifest ?? const [])
        .where((item) => item.route != AdminRoutes.home)
        .toList();

    return Column(
      children: [
        Material(
          color: t.surface,
          child: SafeArea(
            bottom: false,
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: t.border)),
              ),
              child: Row(
                children: [
                  AppAvatar(
                    imageUrl: session?.tenant.logoUrl,
                    initials: session?.tenant.name.isNotEmpty == true
                        ? session!.tenant.name[0]
                        : 'S',
                    size: 32,
                  ),
                  const SizedBox(width: AppSpacing.s2),
                  Expanded(
                    child: Text(
                      roleName,
                      style: AppTypography.bodyMedium(color: t.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    icon: Icon(PhosphorIconsRegular.gear, color: t.textPrimary),
                    onPressed: () => context.push(AdminRoutes.settings),
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.s4),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      PhosphorIconsRegular.hourglassMedium,
                      color: t.textTertiary,
                      size: 26,
                    ),
                    const SizedBox(height: AppSpacing.s3),
                    Text(
                      '$roleName home is coming',
                      style: AppTypography.h3(color: t.textPrimary),
                    ),
                    const SizedBox(height: AppSpacing.s2),
                    Text(
                      'The dedicated screen for your role is still being built '
                      'for mobile. Everything else you have access to works '
                      'normally, and the web admin has more of it today.',
                      style: AppTypography.bodySmall(color: t.textSecondary),
                    ),
                  ],
                ),
              ),
              if (destinations.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.s4),
                Text(
                  'What you can do',
                  style: AppTypography.h3(color: t.textPrimary),
                ),
                const SizedBox(height: AppSpacing.s3),
                AppCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final item in destinations)
                        AppListTile(
                          title: item.label,
                          showChevron: true,
                          onTap: () => context.go(item.route),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
