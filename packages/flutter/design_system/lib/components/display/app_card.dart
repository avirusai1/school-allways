import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/elevation.dart';
import '../../tokens/radius.dart';
import '../../tokens/spacing.dart';

/// Card for genuinely separate objects only — never wrap a list.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.s4),
    this.onTap,
    this.floating = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool floating;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    // M3 "tonal elevation": a card is a step UP the surface-container scale
    // from the page background, not a white box with a hairline border. A
    // floating card takes one more step (surfaceContainer) plus a soft
    // shadow — M3 elevated cards use both cues together, tonal shift being
    // the dominant one.
    final decoration = BoxDecoration(
      color: floating ? t.surfaceContainer : t.surfaceAlt,
      borderRadius: AppRadius.borderMd,
      boxShadow: floating ? AppShadows.sm : null,
    );

    final content = Padding(padding: padding, child: child);

    if (onTap == null) {
      return DecoratedBox(decoration: decoration, child: content);
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadius.borderMd,
        overlayColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.pressed)) return t.stateLayerPress;
          if (states.contains(WidgetState.hovered)) return t.stateLayerHover;
          if (states.contains(WidgetState.focused)) return t.stateLayerFocus;
          return null;
        }),
        child: Ink(decoration: decoration, child: content),
      ),
    );
  }
}
