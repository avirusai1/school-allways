import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../core/sync_chrome.dart';
import '../../../router/routes.dart';
import '../../attendance/data/attendance_repository.dart';

final pendingAttendanceProvider =
    FutureProvider.autoDispose<List<PendingSection>>((ref) async {
  final day = DateTime.now().toIso8601String().substring(0, 10);
  final repo = AttendanceRepository(ref.watch(apiClientProvider));
  try {
    return await repo.fetchPending(day);
  } catch (_) {
    return const [];
  }
});

final principalStatsProvider =
    FutureProvider.autoDispose<_PrincipalStats>((ref) async {
  final api = ref.watch(apiClientProvider);
  final day = DateTime.now().toIso8601String().substring(0, 10);
  var feesToday = 0;
  final pending = await ref.watch(pendingAttendanceProvider.future);
  try {
    final daybook = await api.get<Map<String, dynamic>>(
      '/fees/daybook',
      queryParameters: {'day': day},
    );
    final expected =
        (daybook.data?['expected'] as Map<String, dynamic>?) ?? const {};
    feesToday = (expected['cashCollectedPaise'] as int? ?? 0) +
        (expected['chequeCollectedPaise'] as int? ?? 0) +
        (expected['onlineCollectedPaise'] as int? ?? 0);
  } catch (_) {}
  return _PrincipalStats(
    feesTodayPaise: feesToday,
    openItems: pending.length,
  );
});

class _PrincipalStats {
  const _PrincipalStats({
    required this.feesTodayPaise,
    required this.openItems,
  });

  final int feesTodayPaise;
  final int openItems;
}

class PrincipalDashboardScreen extends ConsumerWidget {
  const PrincipalDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final dayLabel =
        DateFormat('EEEE, d MMMM').format(DateTime.now()).toUpperCase();
    final pending = ref.watch(pendingAttendanceProvider);
    final stats = ref.watch(principalStatsProvider);
    final session = ref.watch(sessionProvider).valueOrNull;

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
                  Expanded(
                    child: Text(
                      session?.user.fullName ?? 'Principal',
                      style: AppTypography.bodyMedium(color: t.textPrimary),
                    ),
                  ),
                  const PendingSyncChip(),
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
              Text(dayLabel, style: AppTypography.overline(color: t.textTertiary)),
              const SizedBox(height: AppSpacing.s3),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: AppSpacing.s3,
                crossAxisSpacing: AppSpacing.s3,
                childAspectRatio: 1.4,
                children: [
                  _StatCard(
                    value: pending.valueOrNull == null
                        ? '—'
                        : (pending.valueOrNull!.isEmpty ? '100%' : 'Pending'),
                    label: 'Attendance',
                    color: t.success,
                    onTap: () =>
                        context.push(AdminRoutes.attendanceOverview),
                  ),
                  _StatCard(
                    value: '—',
                    label: 'Staff present',
                    color: t.textPrimary,
                  ),
                  _StatCard(
                    value: stats.valueOrNull == null
                        ? '—'
                        : null,
                    moneyPaise: stats.valueOrNull?.feesTodayPaise,
                    label: 'Fees today',
                    color: t.textPrimary,
                  ),
                  _StatCard(
                    value: '${stats.valueOrNull?.openItems ?? pending.valueOrNull?.length ?? 0}',
                    label: 'Open items',
                    color: t.accent,
                    onTap: () => context.push(AdminRoutes.approvals),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.s4),
              pending.when(
                loading: () => const Skeleton(height: 64, width: double.infinity),
                error: (_, __) => const SizedBox.shrink(),
                data: (items) {
                  if (items.isEmpty) return const SizedBox.shrink();
                  return Container(
                    decoration: BoxDecoration(
                      color: t.dangerBg,
                      borderRadius: AppRadius.borderMd,
                    ),
                    child: AppListTile(
                      title: '${items.length} sections have not marked attendance',
                      showChevron: true,
                      onTap: () =>
                          context.push(AdminRoutes.attendanceOverview),
                    ),
                  );
                },
              ),
              const SizedBox(height: AppSpacing.s4),
              Text(
                'Approvals pending',
                style: AppTypography.h3(color: t.textPrimary),
              ),
              AppListTile(
                title: 'Leave · Fee concession · Circular',
                subtitle: 'Open approvals inbox',
                showChevron: true,
                onTap: () => context.push(AdminRoutes.approvals),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    this.value,
    required this.label,
    required this.color,
    this.onTap,
    this.moneyPaise,
  });

  final String? value;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  final int? moneyPaise;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AppCard(
      onTap: onTap,
      child: SizedBox(
        height: 88,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (moneyPaise != null)
              MoneyText(
                paise: moneyPaise!,
                large: true,
                showPaise: false,
                color: color,
              )
            else
              Text(value ?? '—',
                  style: AppTypography.numericLarge(color: color)),
            Text(label, style: AppTypography.caption(color: t.textTertiary)),
          ],
        ),
      ),
    );
  }
}

class AttendanceOverviewScreen extends ConsumerWidget {
  const AttendanceOverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final pending = ref.watch(pendingAttendanceProvider);

    return Column(
      children: [
        const SawAppBar(title: 'Attendance overview'),
        Expanded(
          child: pending.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(),
            ),
            error: (_, __) => Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: ErrorState(
                message: 'Could not load pending sections.',
                onRetry: () => ref.invalidate(pendingAttendanceProvider),
              ),
            ),
            data: (items) {
              if (items.isEmpty) {
                return EmptyState(
                  icon: PhosphorIconsRegular.checkSquare,
                  headline: 'All marked',
                  body: 'Every section has submitted attendance for today.',
                );
              }
              final sorted = [...items]
                ..sort((a, b) => b.minutesOverdue.compareTo(a.minutesOverdue));
              return ListView.builder(
                itemCount: sorted.length,
                itemBuilder: (context, index) {
                  final s = sorted[index];
                  return AppListTile(
                    leading: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: t.danger,
                        shape: BoxShape.circle,
                      ),
                    ),
                    title: s.sectionLabel,
                    subtitle: '${s.minutesOverdue} min overdue',
                    showChevron: true,
                    onTap: () => context.push(
                      '${AdminRoutes.takeAttendance}?sectionId=${s.sectionId}&day=${DateTime.now().toIso8601String().substring(0, 10)}',
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class ApprovalsScreen extends StatelessWidget {
  const ApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      children: [
        const SawAppBar(title: 'Approvals'),
        Expanded(
          child: ListView(
            children: [
              for (final type in const [
                'Leave',
                'Fee concession',
                'Expense',
                'TC',
                'Circular',
              ])
                AppListTile(
                  title: type,
                  subtitle: '0 pending',
                  showChevron: true,
                  onTap: () {},
                ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.s4),
                child: Text(
                  'Swipe approve/reject lands with the approvals API.',
                  style: AppTypography.bodySmall(color: t.textTertiary),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
