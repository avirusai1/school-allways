import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';
import '../buttons/app_button.dart';

/// Inline error banner — never a toast for an error the user must act on.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.message,
    this.onRetry,
    this.retryLabel = 'Retry',
  });

  final String message;
  final VoidCallback? onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.s3),
      decoration: BoxDecoration(
        color: t.dangerBg,
        border: Border(
          left: BorderSide(color: t.danger, width: 3),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Text(
              message,
              style: AppTypography.bodySmall(color: t.dangerText),
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(width: AppSpacing.s2),
            AppButton(
              label: retryLabel,
              onPressed: onRetry,
              variant: AppButtonVariant.ghost,
              size: AppButtonSize.inline,
            ),
          ],
        ],
      ),
    );
  }
}
