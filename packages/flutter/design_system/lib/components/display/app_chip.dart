import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';
import '../../tokens/typography.dart';

/// Status chip / pill. Always carries a letter or word — never colour alone.
enum AppChipTone { neutral, success, danger, warning, info, accent }

class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.label,
    this.tone = AppChipTone.neutral,
    this.backgroundColor,
    this.foregroundColor,
  });

  final String label;
  final AppChipTone tone;

  /// Optional overrides for domain chips (attendance) that need fixed colours.
  final Color? backgroundColor;
  final Color? foregroundColor;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final (Color bg, Color fg) = switch (tone) {
      AppChipTone.neutral => (t.surfaceAlt, t.textSecondary),
      AppChipTone.success => (t.successBg, t.successText),
      AppChipTone.danger => (t.dangerBg, t.dangerText),
      AppChipTone.warning => (t.warningBg, t.warningText),
      AppChipTone.info => (t.infoBg, t.infoText),
      AppChipTone.accent => (t.accent.withOpacity(0.12), t.textPrimary),
    };

    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: backgroundColor ?? bg,
        borderRadius: AppRadius.borderFull,
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: AppTypography.caption(color: foregroundColor ?? fg),
      ),
    );
  }
}
