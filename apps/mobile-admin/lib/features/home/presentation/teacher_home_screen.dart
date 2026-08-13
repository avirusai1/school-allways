import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/sync_chrome.dart';
import '../../../router/routes.dart';
import '../../attendance/application/attendance_provider.dart';
import '../../attendance/data/attendance_repository.dart';
import '../../dashboard/presentation/principal_dashboard_screen.dart';
import '../../driver/presentation/driver_screens.dart';
import '../../fees/presentation/fee_counter_screen.dart';
import '../../gate/presentation/gate_screens.dart';

final teacherPendingProvider =
    FutureProvider.autoDispose<List<PendingSection>>((ref) async {
  final day = DateTime.now().toIso8601String().substring(0, 10);
  try {
    return await ref.watch(attendanceRepositoryProvider).fetchPending(day);
  } catch (_) {
    ref.read(offlineBannerProvider.notifier).state = true;
    return const [];
  }
});

class TeacherHomeScreen extends ConsumerWidget {
  const TeacherHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final session = ref.watch(sessionProvider).valueOrNull;
    final name = session?.user.displayName ??
        session?.user.fullName ??
        'Teacher';
    final sectionIds = session?.scopes.sectionIds ?? const <String>[];
    final day = DateTime.now();
    final dayKey = day.toIso8601String().substring(0, 10);
    final dayLabel =
        DateFormat('EEEE, d MMMM').format(day).toUpperCase();
    final pending = ref.watch(teacherPendingProvider);
    final multiRole = (session?.roles.length ?? 0) > 1;

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
                    child: InkWell(
                      onTap: multiRole
                          ? () => _showRoleSwitcher(context, ref)
                          : null,
                      child: Row(
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              style: AppTypography.bodyMedium(
                                  color: t.textPrimary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (multiRole)
                            Icon(
                              PhosphorIconsRegular.caretDown,
                              size: 16,
                              color: t.textTertiary,
                            ),
                        ],
                      ),
                    ),
                  ),
                  const PendingSyncChip(),
                  IconButton(
                    icon: Icon(PhosphorIconsRegular.bell, color: t.textPrimary),
                    onPressed: () => context.push(AdminRoutes.messages),
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
        const OfflineBanner(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.s4),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      dayLabel,
                      style: AppTypography.overline(color: t.textTertiary),
                    ),
                    const SizedBox(height: AppSpacing.s3),
                    Text(
                      "Today's classes",
                      style: AppTypography.h3(color: t.textPrimary),
                    ),
                    const SizedBox(height: AppSpacing.s3),
                    if (sectionIds.isEmpty)
                      Text(
                        'No sections in your scope yet.',
                        style: AppTypography.bodySmall(color: t.textTertiary),
                      )
                    else
                      for (var i = 0; i < sectionIds.length; i++)
                        _ClassRow(
                          time: i == 0 ? '08:00' : '08:45',
                          label: 'Section · ${sectionIds[i].substring(0, 8)}…',
                          isNext: i == 0,
                          marked: pending.valueOrNull
                                  ?.every((p) => p.sectionId != sectionIds[i]) ==
                              true,
                          onMark: () {
                            ref.read(activeSectionIdProvider.notifier).state =
                                sectionIds[i];
                            ref.read(attendanceDayProvider.notifier).state =
                                dayKey;
                            context.push(
                              '${AdminRoutes.takeAttendance}?sectionId=${sectionIds[i]}&day=$dayKey',
                            );
                          },
                        ),
                  ],
                ),
              ),
              pending.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (items) {
                  final mine = items
                      .where((p) => sectionIds.contains(p.sectionId))
                      .toList();
                  if (mine.isEmpty) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.s3),
                    child: AppCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.s4),
                            child: Text(
                              'Needs your attention',
                              style: AppTypography.h3(color: t.textPrimary),
                            ),
                          ),
                          for (final item in mine)
                            AppListTile(
                              dense: true,
                              title:
                                  'Attendance not marked for ${item.sectionLabel}',
                              subtitle: item.minutesOverdue > 0
                                  ? '${item.minutesOverdue} min overdue'
                                  : null,
                              showChevron: true,
                              onTap: () {
                                ref
                                    .read(activeSectionIdProvider.notifier)
                                    .state = item.sectionId;
                                context.push(
                                  '${AdminRoutes.takeAttendance}?sectionId=${item.sectionId}&day=$dayKey',
                                );
                              },
                            ),
                          AppListTile(
                            dense: true,
                            title: 'Unread parent messages',
                            showChevron: true,
                            onTap: () => context.push(AdminRoutes.messages),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: AppSpacing.s3),
              Text(
                'Quick actions',
                style: AppTypography.h3(color: t.textPrimary),
              ),
              const SizedBox(height: AppSpacing.s3),
              Row(
                children: [
                  Expanded(
                    child: _QuickTile(
                      icon: PhosphorIconsRegular.checkSquare,
                      label: 'Take attendance',
                      onTap: () => context.go(AdminRoutes.attendance),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  Expanded(
                    child: _QuickTile(
                      icon: PhosphorIconsRegular.notebook,
                      label: 'Post homework',
                      onTap: () => context.go(AdminRoutes.homework),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s3),
                  Expanded(
                    child: _QuickTile(
                      icon: PhosphorIconsRegular.bookOpen,
                      label: 'Write diary',
                      onTap: () => context.push(AdminRoutes.diary),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _showRoleSwitcher(BuildContext context, WidgetRef ref) async {
    final session = ref.read(sessionProvider).valueOrNull;
    if (session == null) return;
    await showAppBottomSheet(
      context: context,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.s4,
          0,
          AppSpacing.s4,
          AppSpacing.s6,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Switch role',
              style: AppTypography.h3(color: context.tokens.textPrimary),
            ),
            const SizedBox(height: AppSpacing.s3),
            for (final role in session.roles)
              AppListTile(
                title: role.name,
                subtitle: role.code,
                trailing: role.isPrimary
                    ? Icon(PhosphorIconsRegular.check,
                        color: context.tokens.primary)
                    : null,
                onTap: () async {
                  Navigator.of(context).pop();
                  await ref.read(sessionProvider.notifier).refresh();
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _ClassRow extends StatelessWidget {
  const _ClassRow({
    required this.time,
    required this.label,
    required this.onMark,
    this.isNext = false,
    this.marked = false,
  });

  final String time;
  final String label;
  final VoidCallback onMark;
  final bool isNext;
  final bool marked;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      height: 44,
      margin: const EdgeInsets.only(bottom: AppSpacing.s2),
      decoration: BoxDecoration(
        color: isNext ? t.primary.withValues(alpha: 0.08) : t.surfaceAlt,
        borderRadius: AppRadius.borderSm,
        border: isNext
            ? Border(left: BorderSide(color: t.primary, width: 3))
            : null,
      ),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s3),
      child: Row(
        children: [
          SizedBox(
            width: 48,
            child: Text(time, style: AppTypography.caption(color: t.textTertiary)),
          ),
          Expanded(
            child: Text(label, style: AppTypography.body(color: t.textPrimary)),
          ),
          AppButton(
            label: marked ? '✓ marked' : 'Mark →',
            size: AppButtonSize.inline,
            variant: AppButtonVariant.ghost,
            onPressed: onMark,
          ),
        ],
      ),
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Material(
      color: t.surface,
      borderRadius: AppRadius.borderMd,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.borderMd,
        child: Container(
          height: 72,
          decoration: BoxDecoration(
            borderRadius: AppRadius.borderMd,
            border: Border.all(color: t.border),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: t.primary, size: 22),
              const SizedBox(height: AppSpacing.s1),
              Text(
                label,
                textAlign: TextAlign.center,
                style: AppTypography.caption(color: t.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Routes home by session.homeScreen key — never by role code.
class RoleHomeScreen extends ConsumerWidget {
  const RoleHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final home = ref.watch(sessionProvider).valueOrNull?.homeScreen;
    return switch (home) {
      'principal_dashboard' ||
      'coordinator_dashboard' ||
      'admin_dashboard' =>
        const PrincipalDashboardScreen(),
      'gate_scanner' => const GateScannerScreen(),
      'driver_home' => const DriverHomeScreen(),
      'finance_dashboard' || 'fee_counter' => const FeeCounterScreen(),
      _ => const TeacherHomeScreen(),
    };
  }
}
