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
    final decoration = BoxDecoration(
      color: t.surface,
      borderRadius: AppRadius.borderMd,
      border: Border.all(color: t.border, width: 1),
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
        child: Ink(decoration: decoration, child: content),
      ),
    );
  }
}
