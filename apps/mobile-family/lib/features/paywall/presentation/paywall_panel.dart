import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/paywall.dart';
import '../../home/application/family_home_provider.dart';

/// Reusable parent paywall. Never mention cash, the school office, or any
/// payment method other than the forthcoming Play Billing flow.
class PaywallPanel extends StatelessWidget {
  const PaywallPanel({
    super.key,
    this.studentName,
    this.status,
    this.graceEndsAt,
    this.amountPaise = 36500,
    this.compact = false,
  });

  final String? studentName;
  final String? status;
  final String? graceEndsAt;
  final int amountPaise;
  final bool compact;

  String get _who {
    final name = studentName?.trim();
    if (name == null || name.isEmpty) return 'this student';
    return name;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final inGrace = status == 'grace';
    final graceLabel = _graceLabel();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            compact
                ? 'Other school data is paused'
                : 'This section unlocks once $_who is subscribed',
            style: AppTypography.h3(color: t.textPrimary),
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            compact
                ? "$_who's homework, notices, fees and the rest of the parent app are paused until they are subscribed. Today's attendance stays visible."
                : 'Homework, results, fees, leave, the diary, books and bus tracking unlock with a subscription. Today\'s attendance stays visible either way.',
            style: AppTypography.bodySmall(color: t.textSecondary),
          ),
          const SizedBox(height: AppSpacing.s3),
          Text(
            '₹1 per day per student — ${formatIndianMoney(amountPaise, showPaise: false)} a year, GST included.',
            style: AppTypography.bodyMedium(color: t.textPrimary),
          ),
          if (inGrace && graceLabel != null) ...[
            const SizedBox(height: AppSpacing.s2),
            Text(
              graceLabel,
              style: AppTypography.bodySmall(color: t.warningText),
            ),
          ],
          const SizedBox(height: AppSpacing.s3),
          Text(
            'If you need this unlocked, your school can help.',
            style: AppTypography.bodySmall(color: t.textTertiary),
          ),
          const SizedBox(height: AppSpacing.s4),
          // TODO(work-order: wire-subscription-lock-paywall-mobile): Google Play
          // Billing is out of scope this round — no product IDs, RTDN webhook,
          // or receipt validation. Leave Subscribe disabled until a Play
          // Console / merchant account exists. Do not fake a payment flow.
          AppButton(
            label: 'Subscribe — coming soon',
            expanded: true,
            onPressed: null,
          ),
        ],
      ),
    );
  }

  String? _graceLabel() {
    if (status != 'grace') return null;
    final remaining = graceDaysRemaining(graceEndsAt);
    if (remaining == null) {
      return 'Included in the school trial. Full access continues until the trial ends.';
    }
    if (remaining <= 0) {
      return 'The school trial ends today.';
    }
    final dayWord = remaining == 1 ? 'day' : 'days';
    return 'Included in the school trial — $remaining $dayWord remaining.';
  }
}

/// Routes a 402 to [PaywallPanel] instead of a generic [ErrorState].
class PaywallOrError extends StatelessWidget {
  const PaywallOrError({
    super.key,
    required this.error,
    required this.onRetry,
    this.fallbackMessage = 'Could not load this section.',
    this.studentName,
    this.status,
    this.graceEndsAt,
    this.amountPaise,
  });

  final Object error;
  final VoidCallback onRetry;
  final String fallbackMessage;
  final String? studentName;
  final String? status;
  final String? graceEndsAt;
  final int? amountPaise;

  @override
  Widget build(BuildContext context) {
    final required = subscriptionRequiredOf(error);
    if (required != null) {
      return PaywallPanel(
        studentName: studentName,
        status: status,
        graceEndsAt: graceEndsAt,
        amountPaise: amountPaise ?? required.amountPaise,
      );
    }
    return ErrorState(
      message: fallbackMessage,
      onRetry: onRetry,
    );
  }
}

/// Reads the selected child so gated screens don't duplicate paywall copy.
class GatedPaywallOrError extends ConsumerWidget {
  const GatedPaywallOrError({
    super.key,
    required this.error,
    required this.onRetry,
    this.fallbackMessage = 'Could not load this section.',
  });

  final Object error;
  final VoidCallback onRetry;
  final String fallbackMessage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = ref.watch(selectedChildProvider);
    return PaywallOrError(
      error: error,
      onRetry: onRetry,
      fallbackMessage: fallbackMessage,
      studentName: child?.displayName,
      status: child?.status,
      graceEndsAt: child?.graceEndsAt,
    );
  }
}

Future<void> showPaywallIfRequired(
  BuildContext context,
  WidgetRef ref,
  Object error, {
  String fallback = 'Request failed',
}) async {
  final required = subscriptionRequiredOf(error);
  if (required == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(fallback)),
    );
    return;
  }
  final child = ref.read(selectedChildProvider);
  await showAppBottomSheet<void>(
    context: context,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.s4,
        0,
        AppSpacing.s4,
        AppSpacing.s4,
      ),
      child: PaywallPanel(
        studentName: child?.displayName,
        status: child?.status,
        graceEndsAt: child?.graceEndsAt,
        amountPaise: required.amountPaise,
      ),
    ),
  );
}

int? graceDaysRemaining(String? graceEndsAt) {
  if (graceEndsAt == null || graceEndsAt.isEmpty) return null;
  final end = DateTime.tryParse(graceEndsAt);
  if (end == null) return null;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final endDay = DateTime(end.year, end.month, end.day);
  return endDay.difference(today).inDays;
}
