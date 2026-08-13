import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';
import '../buttons/app_button.dart';

/// Destructive confirm dialog that names the specific object.
/// Never "Are you sure?" — pass a concrete [message].
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool isDestructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final t = ctx.tokens;
      return AlertDialog(
        title: Text(title, style: AppTypography.h2(color: t.textPrimary)),
        content: Text(message, style: AppTypography.body(color: t.textSecondary)),
        actionsPadding: const EdgeInsets.fromLTRB(
          AppSpacing.s4,
          0,
          AppSpacing.s4,
          AppSpacing.s4,
        ),
        actions: [
          AppButton(
            label: cancelLabel,
            onPressed: () => Navigator.of(ctx).pop(false),
            variant: AppButtonVariant.ghost,
          ),
          const SizedBox(width: AppSpacing.s2),
          AppButton(
            label: confirmLabel,
            onPressed: () => Navigator.of(ctx).pop(true),
            variant: isDestructive
                ? AppButtonVariant.danger
                : AppButtonVariant.primary,
          ),
        ],
      );
    },
  );
  return result ?? false;
}
