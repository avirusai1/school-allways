import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../application/fees_provider.dart';
import '../domain/fees_model.dart';
import '../../paywall/presentation/paywall_panel.dart';

class FeesScreen extends ConsumerWidget {
  const FeesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(feesProvider);
    final t = context.tokens;

    return Column(
      children: [
        const SawAppBar(title: 'Fees'),
        Expanded(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 4, rowHeight: 64),
            ),
            error: (e, _) => GatedPaywallOrError(
              error: e,
              fallbackMessage: 'Could not load fees.',
              onRetry: () => ref.read(feesProvider.notifier).refresh(),
            ),
            data: (fees) => RefreshIndicator(
              color: t.primary,
              onRefresh: () => ref.read(feesProvider.notifier).refresh(),
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.s4),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        MoneyText(
                          paise: fees.outstandingPaise,
                          large: true,
                          showPaise: false,
                          color: fees.outstandingPaise > 0
                              ? t.danger
                              : t.success,
                        ),
                        Text(
                          'Total outstanding',
                          style: AppTypography.caption(color: t.textTertiary),
                        ),
                        if (fees.outstandingPaise > 0) ...[
                          const SizedBox(height: AppSpacing.s4),
                          AppButton(
                            label: 'Pay now',
                            expanded: true,
                            onPressed: () => _payAll(context, ref, fees),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  if (fees.invoices.isEmpty)
                    const EmptyState(
                      icon: Icons.currency_rupee,
                      headline: 'No invoices yet',
                      body:
                          'When your school issues fee invoices, they will show up here with the amount due.',
                    )
                  else ...[
                    Text('Invoices',
                        style: AppTypography.h3(color: t.textPrimary)),
                    const SizedBox(height: AppSpacing.s2),
                    ...fees.invoices.map(
                      (inv) => _InvoiceRow(
                        invoice: inv,
                        onTap: () => context.push('/fees/invoices/${inv.id}'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _payAll(
    BuildContext context,
    WidgetRef ref,
    FeesOverview fees,
  ) async {
    final payable = fees.payable;
    if (payable.isEmpty) return;
    try {
      final init = await ref.read(feesRepositoryProvider).initiatePayment(
            invoiceIds: payable.map((e) => e.id).toList(),
            amountPaise: fees.outstandingPaise,
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

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({required this.invoice, required this.onTap});

  final FeeInvoice invoice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppListTile(
      title: invoice.termName,
      subtitle: invoice.dueLabel,
      onTap: onTap,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          MoneyText(paise: invoice.amountPaise, showPaise: false),
          const SizedBox(width: AppSpacing.s2),
          FeeStatusBadge(status: _map(invoice.status)),
        ],
      ),
    );
  }

  FeeStatus _map(InvoiceStatus s) => switch (s) {
        InvoiceStatus.paid => FeeStatus.paid,
        InvoiceStatus.due => FeeStatus.due,
        InvoiceStatus.overdue => FeeStatus.overdue,
        InvoiceStatus.partial => FeeStatus.partial,
      };
}
