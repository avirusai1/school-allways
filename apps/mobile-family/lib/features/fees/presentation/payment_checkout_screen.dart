import 'dart:async';

import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../application/fees_provider.dart';
import '../domain/fees_model.dart';

/// Survives backgrounding: polls GET /family/payments/:id on resume.
class PaymentCheckoutScreen extends ConsumerStatefulWidget {
  const PaymentCheckoutScreen({
    super.key,
    required this.paymentId,
    required this.amountPaise,
    this.checkoutUrl,
  });

  final String paymentId;
  final int amountPaise;
  final String? checkoutUrl;

  @override
  ConsumerState<PaymentCheckoutScreen> createState() =>
      _PaymentCheckoutScreenState();
}

class _PaymentCheckoutScreenState extends ConsumerState<PaymentCheckoutScreen>
    with WidgetsBindingObserver {
  PaymentStatus? _status;
  String? _error;
  bool _polling = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_openCheckout());
    unawaited(_poll());
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Webhook is source of truth — never trust the client callback alone.
    if (state == AppLifecycleState.resumed) {
      unawaited(_poll());
    }
  }

  Future<void> _openCheckout() async {
    final url = widget.checkoutUrl;
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _poll() async {
    if (_polling) return;
    if (_status?.isTerminal == true) return;
    _polling = true;
    try {
      final status =
          await ref.read(feesRepositoryProvider).pollPayment(widget.paymentId);
      if (!mounted) return;
      setState(() {
        _status = status;
        _error = null;
      });
      if (status.isTerminal) {
        _timer?.cancel();
        await ref.read(feesProvider.notifier).refresh();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      _polling = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final status = _status?.status ?? 'initiated';
    final success = _status?.isSuccess == true;
    final failed = status == 'failed';

    return AppScaffold(
      appBar: const SawAppBar(title: 'Payment'),
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    success
                        ? 'Payment successful'
                        : failed
                            ? 'Payment failed'
                            : 'Waiting for confirmation',
                    style: AppTypography.h3(color: t.textPrimary),
                  ),
                  const SizedBox(height: AppSpacing.s2),
                  MoneyText(
                    paise: widget.amountPaise,
                    large: true,
                    showPaise: false,
                    color: success
                        ? t.success
                        : failed
                            ? t.danger
                            : t.textPrimary,
                  ),
                  const SizedBox(height: AppSpacing.s2),
                  Text(
                    success
                        ? 'Receipt ${_status?.receiptNo ?? '—'}'
                        : 'We confirm payment from the school server, not the phone. You can leave this screen — we will keep checking.',
                    style: AppTypography.bodySmall(color: t.textTertiary),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: AppSpacing.s2),
                    Text(_error!,
                        style: AppTypography.bodySmall(color: t.dangerText)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.s4),
            if (!success && !failed) ...[
              AppButton(
                label: 'Open payment page again',
                expanded: true,
                variant: AppButtonVariant.secondary,
                onPressed: _openCheckout,
              ),
              const SizedBox(height: AppSpacing.s3),
              AppButton(
                label: "I've paid — check now",
                expanded: true,
                onPressed: _poll,
              ),
            ],
            if (success || failed) ...[
              AppButton(
                label: 'Back to fees',
                expanded: true,
                onPressed: () => context.go('/fees'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
