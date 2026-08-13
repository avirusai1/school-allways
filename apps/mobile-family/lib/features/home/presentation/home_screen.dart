import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../router/routes.dart';
import '../../paywall/presentation/paywall_panel.dart';
import '../application/family_home_provider.dart';
import '../domain/family_home.dart';
import 'child_switcher.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final home = ref.watch(familyHomeProvider);

    return Column(
      children: [
        PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Material(
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
                      child: home.when(
                        data: (h) => ChildChip(
                          name: h.student.fullName.isEmpty
                              ? 'Child'
                              : h.student.fullName,
                          photoUrl: h.student.photoPath,
                          subtitle: h.student.rollNo != null
                              ? 'Roll ${h.student.rollNo}'
                              : null,
                          locked: h.locked,
                          onTap: () => showChildSwitcher(context, ref),
                        ),
                        loading: () => const Skeleton(width: 120, height: 24),
                        error: (_, __) => ChildChip(
                          name: 'Child',
                          onTap: () => showChildSwitcher(context, ref),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Icon(PhosphorIconsRegular.bell, color: t.textPrimary),
                          if (home.asData?.value.notices.any((n) => n.unread) ==
                              true)
                            Positioned(
                              right: -2,
                              top: -2,
                              child: Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: t.accent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                        ],
                      ),
                      onPressed: () => context.push(Routes.notices),
                    ),
                    IconButton(
                      icon: Icon(PhosphorIconsRegular.gear, color: t.textPrimary),
                      onPressed: () => context.push(Routes.settings),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: Builder(
            builder: (context) {
              final cached = home.asData?.value;
              if (home.hasError && cached != null) {
                return Column(
                  children: [
                    Material(
                      color: t.dangerBg,
                      child: ListTile(
                        dense: true,
                        title: Text(
                          'Could not refresh. Showing last saved feed.',
                          style: AppTypography.bodySmall(color: t.dangerText),
                        ),
                        trailing: TextButton(
                          onPressed: () =>
                              ref.read(familyHomeProvider.notifier).refresh(),
                          child: const Text('Retry'),
                        ),
                      ),
                    ),
                    Expanded(child: FamilyHomeBody(home: cached)),
                  ],
                );
              }
              return home.when(
                loading: () => const _HomeSkeleton(),
                error: (e, _) => Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: ErrorState(
                    message: 'Could not load home. Pull to retry.',
                    onRetry: () =>
                        ref.read(familyHomeProvider.notifier).refresh(),
                  ),
                ),
                data: (data) => FamilyHomeBody(home: data),
              );
            },
          ),
        ),
      ],
    );
  }
}

class FamilyHomeBody extends ConsumerWidget {
  const FamilyHomeBody({super.key, required this.home, this.onRefresh});

  final FamilyHome home;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    Future<void> refresh() =>
        onRefresh?.call() ?? ref.read(familyHomeProvider.notifier).refresh();

    if (home.locked) {
      return RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.s4),
          children: [
            _TodayStripCard(today: home.today, attendanceOnly: true),
            if (home.needsAttention.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.s3),
              _AttentionCard(items: home.needsAttention),
            ],
            const SizedBox(height: AppSpacing.s3),
            PaywallPanel(
              compact: true,
              studentName: home.student.firstName.isNotEmpty
                  ? home.student.firstName
                  : home.student.fullName,
              status: home.status,
              graceEndsAt: home.graceEndsAt,
            ),
          ],
        ),
      );
    }

    if (home.student.id.isEmpty || home.isQuiet) {
      return RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.s4),
          children: [
            if (home.student.id.isNotEmpty) _TodayStripCard(today: home.today),
            const SizedBox(height: AppSpacing.s3),
            AppCard(
              child: EmptyState(
                icon: PhosphorIconsRegular.house,
                headline: "Nothing here yet",
                body:
                    "Your school hasn't posted anything yet. You'll see attendance and homework here.",
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.s4),
        children: [
          _TodayStripCard(today: home.today),
          if (home.bus != null) ...[
            const SizedBox(height: AppSpacing.s3),
            _BusCard(bus: home.bus!),
          ],
          if (home.needsAttention.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s3),
            _AttentionCard(items: home.needsAttention),
          ],
          if (home.homeworkDue.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s3),
            _HomeworkCard(items: home.homeworkDue),
          ],
          if (home.notices.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s3),
            _NoticesCard(items: home.notices),
          ],
          if (home.latestPhotos.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s3),
            _PhotosRow(photos: home.latestPhotos),
          ],
          const SizedBox(height: AppSpacing.s8),
          Text(
            'Pull to refresh',
            textAlign: TextAlign.center,
            style: AppTypography.caption(color: t.textTertiary),
          ),
        ],
      ),
    );
  }
}

class _TodayStripCard extends StatelessWidget {
  const _TodayStripCard({required this.today, this.attendanceOnly = false});

  final TodayStrip today;
  final bool attendanceOnly;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final attendanceColor = switch (today.attendanceStatus) {
      'present' || 'late' => t.success,
      'absent' => t.danger,
      _ => t.textPrimary,
    };

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            today.label,
            style: AppTypography.overline(color: t.textTertiary),
          ),
          const SizedBox(height: AppSpacing.s3),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      today.attendanceLabel,
                      style: AppTypography.numericLarge(color: attendanceColor),
                    ),
                    Text(
                      'Attendance',
                      style: AppTypography.caption(color: t.textTertiary),
                    ),
                  ],
                ),
              ),
              if (!attendanceOnly) ...[
                Container(width: 1, height: 40, color: t.border),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(left: AppSpacing.s3),
                    child: StatTile(
                      value: '${today.homeworkDueCount}',
                      label: 'Homework',
                    ),
                  ),
                ),
                Container(width: 1, height: 40, color: t.border),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(left: AppSpacing.s3),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        MoneyText(
                          paise: today.feesDuePaise,
                          showPaise: false,
                          large: true,
                        ),
                        Text(
                          'Fees due',
                          style: AppTypography.caption(color: t.textTertiary),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _BusCard extends StatelessWidget {
  const _BusCard({required this.bus});

  final BusCard bus;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.s4),
      decoration: BoxDecoration(
        color: t.infoBg,
        borderRadius: AppRadius.borderMd,
      ),
      child: Row(
        children: [
          Icon(PhosphorIconsRegular.bus, color: t.infoText),
          const SizedBox(width: AppSpacing.s3),
          Expanded(
            child: Text(
              '${bus.routeName} · ${bus.stopsAway} stops away · ETA ${bus.eta}',
              style: AppTypography.bodyMedium(color: t.infoText),
            ),
          ),
          AppButton(
            label: 'Track',
            variant: AppButtonVariant.ghost,
            size: AppButtonSize.inline,
            onPressed: () => context.push(Routes.bus),
          ),
        ],
      ),
    );
  }
}

class _AttentionCard extends StatelessWidget {
  const _AttentionCard({required this.items});

  final List<AttentionItem> items;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (final item in items)
            InkWell(
              onTap: () {
                if (item.route.isNotEmpty) context.push(item.route);
              },
              child: Container(
                decoration: BoxDecoration(
                  border: Border(
                    left: BorderSide(
                      width: 3,
                      color: switch (item.severity) {
                        'red' => t.danger,
                        'orange' => t.warning,
                        _ => t.primary,
                      },
                    ),
                  ),
                ),
                padding: const EdgeInsets.all(AppSpacing.s4),
                width: double.infinity,
                child: Text(
                  item.title,
                  style: AppTypography.body(color: t.textPrimary),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HomeworkCard extends StatelessWidget {
  const _HomeworkCard({required this.items});

  final List<HomeworkDueItem> items;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.s4,
              AppSpacing.s4,
              AppSpacing.s4,
              AppSpacing.s2,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Homework due',
                    style: AppTypography.h3(color: t.textPrimary),
                  ),
                ),
                AppButton(
                  label: 'View all',
                  variant: AppButtonVariant.ghost,
                  size: AppButtonSize.inline,
                  onPressed: () => context.go(Routes.homework),
                ),
              ],
            ),
          ),
          for (final item in items)
            ListTile(
              title: Text(
                item.title,
                style: AppTypography.bodyMedium(color: t.textPrimary),
              ),
              subtitle: Text(
                item.dueToday ? 'Due today' : (item.dueOn ?? ''),
                style: AppTypography.bodySmall(
                  color: item.dueToday ? t.warningText : t.textTertiary,
                ),
              ),
              onTap: () => context.push(Routes.homeworkDetail(item.id)),
            ),
        ],
      ),
    );
  }
}

class _NoticesCard extends StatelessWidget {
  const _NoticesCard({required this.items});

  final List<NoticeItem> items;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.s4),
            child: Text(
              'Recent notices',
              style: AppTypography.h3(color: t.textPrimary),
            ),
          ),
          for (final item in items)
            ListTile(
              title: Text(
                item.title,
                style: AppTypography.bodyMedium(color: t.textPrimary),
              ),
              subtitle: item.preview == null
                  ? null
                  : Text(
                      item.preview!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodySmall(color: t.textTertiary),
                    ),
              trailing: item.unread
                  ? Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: t.accent,
                        shape: BoxShape.circle,
                      ),
                    )
                  : null,
              onTap: () => context.push(Routes.noticeDetail(item.id)),
            ),
        ],
      ),
    );
  }
}

class _PhotosRow extends StatelessWidget {
  const _PhotosRow({required this.photos});

  final List<PhotoThumb> photos;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Latest photos', style: AppTypography.h3(color: t.textPrimary)),
        const SizedBox(height: AppSpacing.s3),
        SizedBox(
          height: 96,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: photos.length.clamp(0, 9),
            separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.s2),
            itemBuilder: (context, i) {
              return ClipRRect(
                borderRadius: AppRadius.borderSm,
                child: Image.network(
                  photos[i].thumbUrl,
                  width: 96,
                  height: 96,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 96,
                    height: 96,
                    color: t.disabledFill,
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.s4),
      children: const [
        Skeleton(width: double.infinity, height: 100),
        SizedBox(height: AppSpacing.s3),
        Skeleton(width: double.infinity, height: 64),
        SizedBox(height: AppSpacing.s3),
        Skeleton(width: double.infinity, height: 120),
      ],
    );
  }
}
