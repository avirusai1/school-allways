import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../application/fees_provider.dart';
import '../domain/fees_model.dart';
import '../../paywall/presentation/paywall_panel.dart';

final invoiceDetailProvider =
    FutureProvider.autoDispose.family<FeeInvoiceDetail, String>((ref, id) {
  return ref.watch(feesRepositoryProvider).fetchInvoice(id);
});

class InvoiceDetailScreen extends ConsumerWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(invoiceDetailProvider(invoiceId));
    final t = context.tokens;

    return AppScaffold(
      appBar: const SawAppBar(title: 'Invoice'),
      body: async.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.s4),
          child: SkeletonList(count: 5, rowHeight: 48),
        ),
        error: (e, _) => GatedPaywallOrError(
          error: e,
          fallbackMessage: 'Could not load invoice.',
          onRetry: () => ref.invalidate(invoiceDetailProvider(invoiceId)),
        ),
        data: (inv) => Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.s4),
                children: [
                  Text(
                    inv.invoiceNo,
                    style: AppTypography.h3(color: t.textPrimary),
                  ),
                  if (inv.dueDate != null)
                    Text(
                      'Due ${inv.dueDate}',
                      style: AppTypography.bodySmall(color: t.textTertiary),
                    ),
                  const SizedBox(height: AppSpacing.s4),
                  for (final line in inv.lines) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: AppSpacing.s2),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              line.description,
                              style: AppTypography.body(
                                color: line.isConcession
                                    ? t.successText
                                    : t.textPrimary,
                              ),
                            ),
                          ),
                          MoneyText(
                            paise: line.amountPaise.abs(),
                            showPaise: false,
                            color: line.isConcession
                                ? t.successText
                                : t.textPrimary,
                          ),
                        ],
                      ),
                    ),
                    Divider(height: 1, color: t.border),
                  ],
                  const SizedBox(height: AppSpacing.s3),
                  Container(
                    padding: const EdgeInsets.only(top: AppSpacing.s3),
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(color: t.border, width: 2),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Total',
                            style: AppTypography.bodyMedium(color: t.textPrimary),
                          ),
                        ),
                        MoneyText(
                          paise: inv.netAmountPaise,
                          showPaise: false,
                          large: true,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (inv.balancePaise > 0)
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: AppButton(
                    label: 'Pay',
                    expanded: true,
                    onPressed: () => _pay(context, ref, inv),
                  ),
                ),
              )
            else
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: AppButton(
                    label: 'Download receipt',
                    expanded: true,
                    variant: AppButtonVariant.secondary,
                    onPressed: () {},
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _pay(
    BuildContext context,
    WidgetRef ref,
    FeeInvoiceDetail inv,
  ) async {
    try {
      final init = await ref.read(feesRepositoryProvider).initiatePayment(
            invoiceIds: [inv.id],
            amountPaise: inv.balancePaise,
          );
      if (!context.mounted) return;
      context.push(
        '/fees/pay/${init.paymentId}',
        extra: {
          'amountPaise': init.amountPaise,
          'checkoutUrl': init.checkoutUrl,
        },
      );
    } catch (e) {
      if (!context.mounted) return;
      await showPaywallIfRequired(context, ref, e, fallback: '$e');
    }
  }
}
