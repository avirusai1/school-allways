import 'package:core_auth/core_auth.dart';
import 'package:core_push/core_push.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/routes.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final session = ref.watch(sessionProvider).valueOrNull;
    final t = context.tokens;

    return Column(
      children: [
        const SawAppBar(title: 'Settings'),
        Expanded(
          child: ListView(
            children: [
              AppListTile(
                title: 'Language',
                subtitle: locale == 'hi' ? 'हिन्दी' : 'English',
                leading: Icon(PhosphorIconsRegular.translate,
                    color: t.textSecondary),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _LangChip(
                      label: 'EN',
                      selected: locale == 'en',
                      onTap: () => ref
                          .read(localeControllerProvider.notifier)
                          .setLocale('en'),
                    ),
                    const SizedBox(width: AppSpacing.s2),
                    _LangChip(
                      label: 'हिं',
                      selected: locale == 'hi',
                      onTap: () => ref
                          .read(localeControllerProvider.notifier)
                          .setLocale('hi'),
                    ),
                  ],
                ),
              ),
              AppListTile(
                title: 'Sync now',
                subtitle: 'Pull latest updates from the school',
                leading: Icon(PhosphorIconsRegular.arrowsClockwise,
                    color: t.textSecondary),
                onTap: () async {
                  try {
                    await ref.read(syncControllerProvider).pull();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Synced')),
                      );
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('$e')),
                      );
                    }
                  }
                },
              ),
              AppListTile(
                title: 'Books',
                subtitle: 'Offline textbooks for this class',
                leading: Icon(PhosphorIconsRegular.bookOpen,
                    color: t.textSecondary),
                showChevron: true,
                onTap: () => context.push(Routes.books),
              ),
              if (session?.user.kind != 'student') ...[
                AppListTile(
                  title: 'Messages',
                  leading: Icon(PhosphorIconsRegular.chatCircle,
                      color: t.textSecondary),
                  showChevron: true,
                  onTap: () => context.push(Routes.messages),
                ),
                AppListTile(
                  title: 'Notices',
                  leading: Icon(PhosphorIconsRegular.megaphone,
                      color: t.textSecondary),
                  showChevron: true,
                  onTap: () => context.push(Routes.notices),
                ),
                AppListTile(
                  title: 'Privacy',
                  subtitle: 'What we hold and who accessed it',
                  leading: Icon(PhosphorIconsRegular.shieldCheck,
                      color: t.textSecondary),
                  showChevron: true,
                  onTap: () => context.push(Routes.privacy),
                ),
              ],
              if (session?.user.kind == 'student' &&
                  session?.features?.safeReporting == true)
                AppListTile(
                  title: 'Report a concern',
                  subtitle: 'Private, only visible to designated staff',
                  leading: Icon(PhosphorIconsRegular.warning,
                      color: t.textSecondary),
                  onTap: () {},
                ),
              AppListTile(
                title: 'Log out',
                leading: Icon(PhosphorIconsRegular.signOut, color: t.danger),
                onTap: () async {
                  await ref.read(pushRegistrationProvider).unregister();
                  await ref.read(sessionProvider.notifier).signOut();
                  if (context.mounted) context.go(Routes.login);
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LangChip extends StatelessWidget {
  const _LangChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.borderSm,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.s2,
          vertical: AppSpacing.s1,
        ),
        decoration: BoxDecoration(
          color: selected ? t.primary : t.surfaceAlt,
          borderRadius: AppRadius.borderSm,
        ),
        child: Text(
          label,
          style: AppTypography.caption(
            color: selected ? t.textOnPrimary : t.textSecondary,
          ),
        ),
      ),
    );
  }
}
