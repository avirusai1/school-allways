import 'dart:async';

import 'package:core_sync/core_sync.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import 'providers.dart';

/// True when the last API call reported offline — never a blocking dialog.
final offlineBannerProvider = StateProvider<bool>((ref) => false);

/// Polls Drift outbox count for the pending-sync chip.
final outboxPendingCountProvider = StreamProvider<int>((ref) async* {
  final db = ref.watch(appDatabaseProvider);
  while (true) {
    yield await db.pendingOutboxCount();
    await Future<void>.delayed(const Duration(seconds: 2));
  }
});

final outboxPendingListProvider =
    FutureProvider.autoDispose<List<OutboxEntryRow>>((ref) async {
  return ref.watch(appDatabaseProvider).allPendingOutbox();
});

/// 32px strip — "Offline — changes will sync".
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offline = ref.watch(offlineBannerProvider);
    if (!offline) return const SizedBox.shrink();
    final t = context.tokens;
    return Container(
      height: 32,
      width: double.infinity,
      color: t.textPrimary,
      alignment: Alignment.center,
      child: Text(
        'Offline — changes will sync',
        style: AppTypography.caption(color: t.surface),
      ),
    );
  }
}

/// App-bar chip whenever the outbox is non-empty.
class PendingSyncChip extends ConsumerWidget {
  const PendingSyncChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(outboxPendingCountProvider).valueOrNull ?? 0;
    if (count == 0) return const SizedBox.shrink();
    final t = context.tokens;
    return IconButton(
      tooltip: '$count pending',
      onPressed: () => _showPending(context, ref),
      icon: Badge(
        label: Text('$count'),
        child: Icon(PhosphorIconsRegular.cloudArrowUp, color: t.warning),
      ),
    );
  }

  Future<void> _showPending(BuildContext context, WidgetRef ref) async {
    final items = await ref.read(outboxPendingListProvider.future);
    if (!context.mounted) return;
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
              'Pending sync',
              style: AppTypography.h3(color: context.tokens.textPrimary),
            ),
            const SizedBox(height: AppSpacing.s3),
            if (items.isEmpty)
              Text(
                'All caught up.',
                style: AppTypography.bodySmall(
                  color: context.tokens.textTertiary,
                ),
              )
            else
              for (final e in items)
                AppListTile(
                  dense: true,
                  title: '${e.method} ${e.path}',
                  subtitle: e.lastError ?? 'Waiting to send',
                ),
            const SizedBox(height: AppSpacing.s3),
            AppButton(
              label: 'Retry now',
              expanded: true,
              onPressed: () {
                unawaited(ref.read(outboxWorkerProvider).flush());
                Navigator.of(context).pop();
              },
            ),
          ],
        ),
      ),
    );
  }
}
