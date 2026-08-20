import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';

class BottomNavItem {
  const BottomNavItem({
    required this.icon,
    required this.label,
    this.activeIcon,
  });

  final IconData icon;
  final IconData? activeIcon;
  final String label;
}

/// Family/admin-app bottom nav: max 5 items.
///
/// M3's navigation bar signature is a pill-shaped indicator BEHIND the
/// selected icon — not a bar above it. This used to draw a 3px amber line at
/// the top of the selected item (an M2-era pattern); the indicator now sits
/// where M3 puts it, in the accent-container tone.
class AppBottomNav extends StatelessWidget {
  const AppBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  }) : assert(items.length <= 5, 'Bottom nav maximum is 5 items');

  final List<BottomNavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Container(
      height: 64 + bottom,
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border, width: 1)),
      ),
      padding: EdgeInsets.only(bottom: bottom),
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++)
            Expanded(
              child: _NavSlot(
                item: items[i],
                selected: i == currentIndex,
                onTap: () => onTap(i),
              ),
            ),
        ],
      ),
    );
  }
}

class _NavSlot extends StatelessWidget {
  const _NavSlot({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final BottomNavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final iconColor = selected ? t.onAccentContainer : t.textTertiary;
    final labelColor = selected ? t.textPrimary : t.textTertiary;

    return InkWell(
      onTap: onTap,
      overlayColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.pressed)) return t.stateLayerPress;
        if (states.contains(WidgetState.hovered)) return t.stateLayerHover;
        return null;
      }),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            height: 32,
            width: 56,
            decoration: BoxDecoration(
              color: selected ? t.accentContainer : Colors.transparent,
              borderRadius: AppRadius.borderFull,
            ),
            alignment: Alignment.center,
            child: Icon(
              selected ? (item.activeIcon ?? item.icon) : item.icon,
              size: 24,
              color: iconColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            item.label,
            style: AppTypography.caption(color: labelColor)
                .copyWith(fontSize: 11, fontWeight: selected ? FontWeight.w600 : FontWeight.w500),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
