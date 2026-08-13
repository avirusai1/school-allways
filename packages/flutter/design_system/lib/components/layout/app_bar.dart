import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';

/// App bar: height 56, solid surface, 1px bottom border, no shadow.
class SawAppBar extends StatelessWidget implements PreferredSizeWidget {
  const SawAppBar({
    super.key,
    required this.title,
    this.leading,
    this.actions,
    this.centerTitle = false,
  });

  final String title;
  final Widget? leading;
  final List<Widget>? actions;
  final bool centerTitle;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AppBar(
      title: Text(title, style: AppTypography.h1(color: t.textPrimary)),
      titleSpacing: AppSpacing.s4,
      centerTitle: centerTitle,
      leading: leading,
      actions: actions == null
          ? null
          : [
              ...actions!,
              const SizedBox(width: AppSpacing.s2),
            ],
      backgroundColor: t.surface,
      foregroundColor: t.textPrimary,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: Border(bottom: BorderSide(color: t.border, width: 1)),
    );
  }
}
