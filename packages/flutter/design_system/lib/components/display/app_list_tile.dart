import 'package:flutter/material.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';

/// The workhorse list row — rows + dividers, never cards.
class AppListTile extends StatelessWidget {
  const AppListTile({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.showChevron = false,
    this.showDivider = true,
    this.dense = false,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showChevron;
  final bool showDivider;
  final bool dense;

  double get _minHeight {
    if (leading != null && subtitle != null) return 72;
    if (subtitle != null) return 64;
    return dense ? 44 : 56;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Material(
          color: t.surface,
          child: InkWell(
            onTap: onTap,
            splashColor: t.pressedOverlay,
            highlightColor: t.pressedOverlay,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: _minHeight),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
                child: Row(
                  children: [
                    if (leading != null) ...[
                      SizedBox(width: 40, height: 40, child: leading),
                      const SizedBox(width: AppSpacing.s3),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            title,
                            style: AppTypography.bodyMedium(color: t.textPrimary),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (subtitle != null) ...[
                            const SizedBox(height: AppSpacing.lineGap),
                            Text(
                              subtitle!,
                              style: AppTypography.bodySmall(color: t.textTertiary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (trailing != null) ...[
                      const SizedBox(width: AppSpacing.s2),
                      trailing!,
                    ],
                    if (showChevron) ...[
                      const SizedBox(width: AppSpacing.s2),
                      Icon(
                        PhosphorIconsRegular.caretRight,
                        size: 20,
                        color: t.textTertiary,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
        if (showDivider)
          Divider(
            height: 1,
            thickness: 1,
            color: t.border,
            indent: leading != null ? 16 + 40 + 12 : AppSpacing.s4,
            endIndent: 0,
          ),
      ],
    );
  }
}
