import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';

/// Static grey skeleton block — NO shimmer (build/11 §7).
class Skeleton extends StatelessWidget {
  const Skeleton({
    super.key,
    this.width,
    this.height = 16,
    this.borderRadius,
  });

  final double? width;
  final double height;
  final BorderRadius? borderRadius;

  /// Convenience: a list-row shaped skeleton.
  const Skeleton.listRow({super.key})
      : width = double.infinity,
        height = 56,
        borderRadius = null;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: t.disabledFill,
        borderRadius: borderRadius ?? AppRadius.borderSm,
      ),
    );
  }
}

/// Stack of static skeleton rows matching a list layout.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 6, this.rowHeight = 56});

  final int count;
  final double rowHeight;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        count,
        (i) => Padding(
          padding: const EdgeInsets.only(bottom: 1),
          child: Skeleton(width: double.infinity, height: rowHeight),
        ),
      ),
    );
  }
}
