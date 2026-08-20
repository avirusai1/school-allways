import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';
import '../../tokens/typography.dart';

/// Button variants from build/11 §9.
enum AppButtonVariant { primary, secondary, outline, ghost, danger }

/// Button sizes from build/11 §9.
enum AppButtonSize { regular, compact, inline }

/// Spec-compliant button. Primary = amber fill; Secondary = blue fill.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.regular,
    this.loading = false,
    this.expanded = false,
    this.leading,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final bool loading;
  final bool expanded;
  final Widget? leading;

  double get _height => switch (size) {
        AppButtonSize.regular => 48,
        AppButtonSize.compact => 40,
        AppButtonSize.inline => 32,
      };

  double get _hPad => switch (size) {
        AppButtonSize.regular => 20,
        AppButtonSize.compact => 16,
        AppButtonSize.inline => 12,
      };

  /// M3's defining button trait: filled/tonal/outlined/text buttons are
  /// fully rounded (a "stadium" shape), not a fixed corner radius. Radius
  /// equals half the height so it always resolves to a true pill regardless
  /// of size.
  BorderRadius _radiusFor(double height) => BorderRadius.circular(height / 2);

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final enabled = onPressed != null && !loading;

    // M3 structure: Filled (primary/secondary here are both "filled", just
    // different brand hues), Outlined, and Text. The overlay color drives the
    // state layer — it must match what's ON that fill for enabled contrast,
    // per M3's state-layer spec.
    final (Color fill, Color text, BorderSide? border, Color overlayBase) =
        switch (variant) {
      AppButtonVariant.primary => (t.accent, t.textOnAccent, null, t.textOnAccent),
      AppButtonVariant.secondary => (t.primary, t.textOnPrimary, null, t.textOnPrimary),
      AppButtonVariant.outline => (
          Colors.transparent,
          t.textPrimary,
          BorderSide(color: t.outline, width: 1),
          t.primary,
        ),
      AppButtonVariant.ghost => (Colors.transparent, t.primary, null, t.primary),
      AppButtonVariant.danger => (t.danger, t.textOnPrimary, null, t.textOnPrimary),
    };

    final disabledFill = variant == AppButtonVariant.outline ||
            variant == AppButtonVariant.ghost
        ? Colors.transparent
        : t.disabledFill;
    final disabledText = t.disabledText;

    final textStyle = switch (size) {
      AppButtonSize.regular => AppTypography.bodyMedium(
          color: enabled ? text : disabledText,
        ).copyWith(fontWeight: FontWeight.w600),
      AppButtonSize.compact => AppTypography.body(
          color: enabled ? text : disabledText,
        ).copyWith(fontSize: 14, fontWeight: FontWeight.w500),
      AppButtonSize.inline => AppTypography.bodySmall(
          color: enabled ? text : disabledText,
        ).copyWith(fontWeight: FontWeight.w500),
    };

    // Ghost uses compact height by default per spec.
    final height = variant == AppButtonVariant.ghost && size == AppButtonSize.regular
        ? 40.0
        : _height;
    final hPad = variant == AppButtonVariant.ghost && size == AppButtonSize.regular
        ? 12.0
        : _hPad;
    final radius = _radiusFor(height);

    final child = loading
        ? SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: enabled ? text : disabledText,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (leading != null) ...[
                IconTheme(
                  data: IconThemeData(
                    color: enabled ? text : disabledText,
                    size: 20,
                  ),
                  child: leading!,
                ),
                const SizedBox(width: 8),
              ],
              Text(label, style: textStyle),
            ],
          );

    return SizedBox(
      height: height,
      width: expanded ? double.infinity : null,
      child: Material(
        color: enabled ? fill : disabledFill,
        borderRadius: radius,
        child: InkWell(
          onTap: enabled ? onPressed : null,
          borderRadius: radius,
          // M3 canonical state-layer opacities, keyed to whatever sits ON
          // this fill (white text on a filled button, primary on outline/text).
          overlayColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return overlayBase.withValues(alpha: 0.10);
            }
            if (states.contains(WidgetState.hovered)) {
              return overlayBase.withValues(alpha: 0.08);
            }
            if (states.contains(WidgetState.focused)) {
              return overlayBase.withValues(alpha: 0.10);
            }
            return null;
          }),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: radius,
              border: border != null && enabled
                  ? Border.fromBorderSide(border)
                  : null,
            ),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: hPad),
              child: Center(child: child),
            ),
          ),
        ),
      ),
    );
  }
}
