import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/spacing.dart';

/// Icon-only button with a mandatory semantic [tooltip] (a11y).
/// Visual target may be 24px; hit target is always ≥ 48×48.
class AppIconButton extends StatelessWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    this.onPressed,
    this.color,
    this.size = 24,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Tooltip(
      message: tooltip,
      child: SizedBox(
        width: AppSpacing.s12,
        height: AppSpacing.s12,
        child: IconButton(
          onPressed: onPressed,
          icon: Icon(icon, size: size),
          color: color ?? t.textSecondary,
          disabledColor: t.disabledText,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(
            minWidth: AppSpacing.s12,
            minHeight: AppSpacing.s12,
          ),
          splashRadius: 24,
        ),
      ),
    );
  }
}
