import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../core/sync_chrome.dart';
import '../../../router/routes.dart';

class FeeCounterScreen extends ConsumerStatefulWidget {
  const FeeCounterScreen({super.key});

  @override
  ConsumerState<FeeCounterScreen> createState() => _FeeCounterScreenState();
}

class _FeeCounterScreenState extends ConsumerState<FeeCounterScreen> {
  late Future<_FeeCounterData> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_FeeCounterData> _load() async {
    final api = ref.read(apiClientProvider);
    try {
      final day = DateTime.now().toIso8601String().substring(0, 10);
      final daybook = await api.get<Map<String, dynamic>>(
        '/fees/daybook',
        queryParameters: {'day': day},
      );
      final defaulters = await api.get<Map<String, dynamic>>('/fees/defaulters');
      final expected =
          (daybook.data?['expected'] as Map<String, dynamic>?) ?? const {};
      final entry =
          (daybook.data?['entry'] as Map<String, dynamic>?) ?? const {};
      final list = (defaulters.data?['data'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(_Defaulter.fromJson)
          .toList();
      ref.read(offlineBannerProvider.notifier).state = false;
      return _FeeCounterData(
        openingCashPaise: expected['openingCashPaise'] as int? ?? 0,
        cashCollectedPaise: expected['cashCollectedPaise'] as int? ?? 0,
        chequeCollectedPaise: expected['chequeCollectedPaise'] as int? ?? 0,
        onlineCollectedPaise: expected['onlineCollectedPaise'] as int? ?? 0,
        cashDepositedPaise: entry['cashDepositedPaise'] as int? ?? 0,
        closingCashPaise: entry['closingCashPaise'] as int?,
        variancePaise: entry['variancePaise'] as int? ?? 0,
        defaulters: list,
      );
    } catch (_) {
      ref.read(offlineBannerProvider.notifier).state = true;
      return const _FeeCounterData(
        openingCashPaise: 0,
        cashCollectedPaise: 0,
        chequeCollectedPaise: 0,
        onlineCollectedPaise: 0,
        cashDepositedPaise: 0,
        variancePaise: 0,
        defaulters: [],
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      body: Column(
        children: [
          const SawAppBar(
            title: 'Fee counter',
            actions: [PendingSyncChip()],
          ),
          const OfflineBanner(),
          Expanded(
            child: FutureBuilder<_FeeCounterData>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Padding(
                    padding: EdgeInsets.all(AppSpacing.s4),
                    child: SkeletonList(count: 4, rowHeight: 64),
                  );
                }
                final data = snap.data ??
                    const _FeeCounterData(
                      openingCashPaise: 0,
                      cashCollectedPaise: 0,
                      chequeCollectedPaise: 0,
                      onlineCollectedPaise: 0,
                      cashDepositedPaise: 0,
                      variancePaise: 0,
                      defaulters: [],
                    );
                final expectedClosing = data.openingCashPaise +
                    data.cashCollectedPaise -
                    data.cashDepositedPaise;
                return RefreshIndicator(
                  color: t.primary,
                  onRefresh: () async {
                    setState(() => _future = _load());
                    await _future;
                  },
                  child: ListView(
                    padding: const EdgeInsets.all(AppSpacing.s4),
                    children: [
                      Text('Daybook',
                          style: AppTypography.h3(color: t.textPrimary)),
                      const SizedBox(height: AppSpacing.s2),
                      _row(context, 'Opening cash', data.openingCashPaise),
                      _row(context, 'Cash collected', data.cashCollectedPaise),
                      _row(
                          context, 'Cheque / DD', data.chequeCollectedPaise),
                      _row(context, 'Online', data.onlineCollectedPaise),
                      _row(context, 'Deposits', data.cashDepositedPaise),
                      _row(
                        context,
                        'Expected closing',
                        expectedClosing,
                      ),
                      if (data.closingCashPaise != null)
                        _row(context, 'Counted closing', data.closingCashPaise!),
                      Container(
                        margin: const EdgeInsets.only(top: AppSpacing.s2),
                        padding: const EdgeInsets.all(AppSpacing.s3),
                        decoration: BoxDecoration(
                          color: data.variancePaise != 0
                              ? t.dangerBg
                              : t.successBg,
                          borderRadius: AppRadius.borderSm,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Variance',
                                style: AppTypography.bodyMedium(
                                  color: data.variancePaise != 0
                                      ? t.dangerText
                                      : t.successText,
                                ),
                              ),
                            ),
                            MoneyText(
                              paise: data.variancePaise.abs(),
                              showPaise: false,
                              color: data.variancePaise != 0
                                  ? t.dangerText
                                  : t.successText,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.s4),
                      Text('Outstanding',
                          style: AppTypography.h3(color: t.textPrimary)),
                      const SizedBox(height: AppSpacing.s2),
                      if (data.defaulters.isEmpty)
                        const EmptyState(
                          icon: Icons.currency_rupee,
                          headline: 'No outstanding invoices',
                          body:
                              'Generate invoices from the web console, then collect here.',
                        )
                      else
                        ...data.defaulters.map(
                          (d) => Padding(
                            padding:
                                const EdgeInsets.only(bottom: AppSpacing.s2),
                            child: AppCard(
                              onTap: () =>
                                  context.push(AdminRoutes.collectFee),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          d.studentName,
                                          style: AppTypography.body(
                                            color: t.textPrimary,
                                          ),
                                        ),
                                        Text(
                                          '${d.invoiceNo} · due ${d.dueDate}',
                                          style: AppTypography.caption(
                                            color: t.textTertiary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  MoneyText(
                                    paise: d.balancePaise,
                                    showPaise: false,
                                    color: t.danger,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(AdminRoutes.collectFee),
        backgroundColor: t.accent,
        foregroundColor: t.textOnAccent,
        icon: const Icon(PhosphorIconsRegular.plus),
        label: const Text('Collect fee'),
      ),
    );
  }

  Widget _row(BuildContext context, String label, int paise) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.s1),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: AppTypography.body(color: t.textSecondary)),
          ),
          MoneyText(paise: paise, showPaise: false),
        ],
      ),
    );
  }
}

class _FeeCounterData {
  const _FeeCounterData({
    required this.openingCashPaise,
    required this.cashCollectedPaise,
    required this.chequeCollectedPaise,
    required this.onlineCollectedPaise,
    required this.cashDepositedPaise,
    required this.variancePaise,
    required this.defaulters,
    this.closingCashPaise,
  });

  final int openingCashPaise;
  final int cashCollectedPaise;
  final int chequeCollectedPaise;
  final int onlineCollectedPaise;
  final int cashDepositedPaise;
  final int? closingCashPaise;
  final int variancePaise;
  final List<_Defaulter> defaulters;
}

class _Defaulter {
  const _Defaulter({
    required this.studentName,
    required this.invoiceNo,
    required this.dueDate,
    required this.balancePaise,
  });

  final String studentName;
  final String invoiceNo;
  final String dueDate;
  final int balancePaise;

  factory _Defaulter.fromJson(Map<String, dynamic> json) {
    return _Defaulter(
      studentName: json['studentName'] as String? ??
          [
            json['firstName'],
            json['lastName'],
          ].whereType<String>().join(' '),
      invoiceNo: json['invoiceNo'] as String? ?? '',
      dueDate: json['dueDate'] as String? ?? '',
      balancePaise: json['balancePaise'] as int? ?? 0,
    );
  }
}
