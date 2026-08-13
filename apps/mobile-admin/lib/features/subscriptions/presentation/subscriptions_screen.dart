import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/subscriptions_provider.dart';
import '../domain/subscription_models.dart';

class SubscriptionsScreen extends ConsumerWidget {
  const SubscriptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final canActivate =
        session?.permissions.contains('subscription.manual.activate') == true;
    final async = ref.watch(subscriptionListProvider);
    final selected = ref.watch(subscriptionSelectionProvider);
    final stay = ref.watch(stayConnectedProvider).asData?.value;

    return Column(
      children: [
        const SawAppBar(title: 'Parent subscriptions'),
        Expanded(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 8, rowHeight: 64),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: ErrorState(
                message: 'Could not load subscription status.',
                onRetry: () => ref.invalidate(subscriptionListProvider),
              ),
            ),
            data: (list) {
              final locked = list.data.where((r) => !r.subscribed).toList();
              final selectedLocked =
                  locked.where((r) => selected.contains(r.id)).toList();
              final invoicePaise =
                  selectedLocked.length * list.meta.amountPaise;

              return Column(
                children: [
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(subscriptionListProvider);
                        ref.invalidate(stayConnectedProvider);
                      },
                      child: ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(AppSpacing.s4),
                        itemCount: list.data.length + 1,
                        itemBuilder: (context, index) {
                          if (index == 0) {
                            return _Header(
                              meta: list.meta,
                              stay: stay,
                              canActivate: canActivate,
                              listEmpty: list.data.isEmpty,
                              lockedCount: locked.length,
                              selectedLockedCount: selectedLocked.length,
                              invoicePaise: invoicePaise,
                              allLockedSelected: locked.isNotEmpty &&
                                  selectedLocked.length == locked.length,
                              onSelectUnpaid: locked.isEmpty
                                  ? null
                                  : () {
                                      final sel = ref.read(
                                        subscriptionSelectionProvider.notifier,
                                      );
                                      if (selectedLocked.length ==
                                          locked.length) {
                                        sel.clear();
                                      } else {
                                        sel.selectAll(
                                          locked.map((r) => r.id),
                                        );
                                      }
                                    },
                              onActivate: !canActivate ||
                                      selectedLocked.isEmpty
                                  ? null
                                  : () => _confirmActivate(
                                        context,
                                        ref,
                                        selectedLocked,
                                        invoicePaise,
                                      ),
                            );
                          }
                          final row = list.data[index - 1];
                          return _StudentRow(
                            row: row,
                            selected: selected.contains(row.id),
                            onToggle: canActivate && !row.subscribed
                                ? () => ref
                                    .read(
                                      subscriptionSelectionProvider.notifier,
                                    )
                                    .toggle(row.id)
                                : null,
                          );
                        },
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _confirmActivate(
    BuildContext context,
    WidgetRef ref,
    List<SubscriptionRow> selectedLocked,
    int invoicePaise,
  ) async {
    final ok = await showConfirmDialog(
      context,
      title:
          'You are activating ${selectedLocked.length} subscriptions. School All Ways will invoice your school ${formatIndianMoney(invoicePaise, showPaise: false)} for these. Continue?',
      message:
          'Only mark students paid after the cash is in hand. Already-subscribed students are skipped.',
      confirmLabel: 'Activate and accept invoice',
      isDestructive: true,
    );
    if (!ok) return;
    try {
      await ref.read(subscriptionsRepositoryProvider).manualActivate(
            selectedLocked.map((r) => r.id).toList(),
          );
      ref.read(subscriptionSelectionProvider.notifier).clear();
      ref.invalidate(subscriptionListProvider);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$e')),
      );
    }
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.meta,
    required this.stay,
    required this.canActivate,
    required this.listEmpty,
    required this.lockedCount,
    required this.selectedLockedCount,
    required this.invoicePaise,
    required this.allLockedSelected,
    required this.onSelectUnpaid,
    required this.onActivate,
  });

  final SubscriptionListMeta meta;
  final StayConnectedStatus? stay;
  final bool canActivate;
  final bool listEmpty;
  final int lockedCount;
  final int selectedLockedCount;
  final int invoicePaise;
  final bool allLockedSelected;
  final VoidCallback? onSelectUnpaid;
  final VoidCallback? onActivate;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '₹365 per student per session, GST included. Mark a student paid only after you have collected the cash — School All Ways will invoice the school for each activation.',
          style: AppTypography.bodySmall(color: t.textSecondary),
        ),
        if (stay?.fee != null && stay!.fee!.status == 'pending') ...[
          const SizedBox(height: AppSpacing.s3),
          _StayConnectedCard(status: stay!),
        ],
        if (meta.inGrace) ...[
          const SizedBox(height: AppSpacing.s3),
          Container(
            padding: const EdgeInsets.all(AppSpacing.s3),
            decoration: BoxDecoration(
              color: t.warningBg,
              borderRadius: AppRadius.borderMd,
              border: Border.all(color: t.warning),
            ),
            child: Text(
              meta.graceEndsAt != null
                  ? 'Grace period is on until ${_formatDay(meta.graceEndsAt!)}. Parents can use the app until then even if they have not paid.'
                  : 'Grace period is on. Parents can use the app until then even if they have not paid.',
              style: AppTypography.bodySmall(color: t.warningText),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.s4),
        const _SearchField(),
        if (listEmpty) ...[
          const SizedBox(height: AppSpacing.s4),
          const EmptyState(
            icon: Icons.person_outline,
            headline: 'No students',
            body: 'No students match these filters.',
          ),
        ],
        if (canActivate) ...[
          const SizedBox(height: AppSpacing.s3),
          Wrap(
            spacing: AppSpacing.s2,
            runSpacing: AppSpacing.s2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              AppButton(
                label: allLockedSelected && lockedCount > 0
                    ? 'Clear selection'
                    : 'Select unpaid',
                variant: AppButtonVariant.outline,
                size: AppButtonSize.compact,
                onPressed: onSelectUnpaid,
              ),
              AppButton(
                label: 'Mark as paid (cash collected)',
                size: AppButtonSize.compact,
                onPressed: onActivate,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            '$selectedLockedCount selected · ${formatIndianMoney(invoicePaise, showPaise: false)} to invoice',
            style: AppTypography.caption(color: t.textTertiary),
          ),
        ],
        const SizedBox(height: AppSpacing.s3),
      ],
    );
  }

  String _formatDay(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    return formatSawDate(parsed);
  }
}

class _SearchField extends ConsumerWidget {
  const _SearchField();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppTextField(
      label: 'Search',
      hint: 'Name or admission no.',
      onChanged: (v) => ref.read(subscriptionQueryProvider.notifier).state = v,
    );
  }
}

class _StayConnectedCard extends StatelessWidget {
  const _StayConnectedCard({required this.status});

  final StayConnectedStatus status;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final fee = status.fee!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.s3),
      decoration: BoxDecoration(
        color: t.warningBg,
        borderRadius: AppRadius.borderMd,
        border: Border.all(color: t.warning),
      ),
      child: Text(
        'Stay Connected Fee of ${formatIndianMoney(fee.totalPaise, showPaise: false)} (₹500 + GST) is pending for ${status.sessionName ?? 'this session'}. Nothing is blocked — this is a reminder only.',
        style: AppTypography.bodySmall(color: t.warningText),
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.row,
    required this.selected,
    required this.onToggle,
  });

  final SubscriptionRow row;
  final bool selected;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    return AppListTile(
      leading: Checkbox(
        value: selected,
        onChanged: onToggle == null ? null : (_) => onToggle!(),
      ),
      title: row.fullName,
      subtitle: [
        row.admissionNo,
        if (row.classLabel != null && row.classLabel!.isNotEmpty) row.classLabel!,
      ].join(' · '),
      trailing: AppChip(
        label: switch (row.status) {
          'grace' => 'Grace',
          'active' => 'Active',
          _ => 'Locked',
        },
        tone: row.status == 'locked' ? AppChipTone.danger : AppChipTone.success,
      ),
      onTap: onToggle,
    );
  }
}
