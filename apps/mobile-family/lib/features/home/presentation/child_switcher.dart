import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/child_switcher_provider.dart';
import '../application/family_home_provider.dart';

Future<void> showChildSwitcher(BuildContext context, WidgetRef ref) {
  return showAppBottomSheet(
    context: context,
    child: const _ChildSwitcherSheet(),
  );
}

class _ChildSwitcherSheet extends ConsumerWidget {
  const _ChildSwitcherSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final childrenAsync = ref.watch(childrenProvider);
    final selected = ref.watch(childSwitcherProvider).valueOrNull;

    return childrenAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.s8),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.s4),
        child: Text('$e', style: AppTypography.bodySmall(color: t.dangerText)),
      ),
      data: (children) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.s4,
            0,
            AppSpacing.s4,
            AppSpacing.s6,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Switch child',
                style: AppTypography.h3(color: t.textPrimary),
              ),
              const SizedBox(height: AppSpacing.s4),
              for (final child in children)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: AppAvatar(
                    imageUrl: child.photoPath,
                    initials: _initials(child.fullName),
                    size: 40,
                  ),
                  title: Text(
                    child.fullName,
                    style: AppTypography.bodyMedium(color: t.textPrimary),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (child.isLocked) ...[
                        const AppChip(
                          label: 'Locked',
                          tone: AppChipTone.danger,
                        ),
                        const SizedBox(width: AppSpacing.s2),
                      ],
                      if (selected == child.id)
                        Icon(PhosphorIconsRegular.check, color: t.primary),
                    ],
                  ),
                  onTap: () async {
                    await ref
                        .read(childSwitcherProvider.notifier)
                        .select(child.id);
                    if (context.mounted) Navigator.of(context).pop();
                  },
                ),
            ],
          ),
        );
      },
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1);
    return '${parts.first[0]}${parts.last[0]}';
  }
}

class ChildChip extends StatelessWidget {
  const ChildChip({
    super.key,
    required this.name,
    this.photoUrl,
    this.subtitle,
    this.locked = false,
    required this.onTap,
  });

  final String name;
  final String? photoUrl;
  final String? subtitle;
  final bool locked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadius.fullAll,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppAvatar(
            imageUrl: photoUrl,
            initials: name.isNotEmpty ? name[0] : '?',
            size: 32,
          ),
          const SizedBox(width: AppSpacing.s2),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyMedium(color: t.textPrimary),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.caption(color: t.textTertiary),
                  ),
              ],
            ),
          ),
          Icon(PhosphorIconsRegular.caretDown, size: 16, color: t.textTertiary),
          if (locked) ...[
            const SizedBox(width: AppSpacing.s2),
            const AppChip(label: 'Locked', tone: AppChipTone.danger),
          ],
        ],
      ),
    );
  }
}
