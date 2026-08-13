import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';

/// Dropdown with label above the field, matching [AppTextField] chrome.
class AppDropdown<T> extends StatelessWidget {
  const AppDropdown({
    super.key,
    required this.label,
    required this.items,
    required this.value,
    required this.onChanged,
    this.hint,
    this.errorText,
    this.enabled = true,
    this.itemLabel,
  });

  final String label;
  final List<T> items;
  final T? value;
  final ValueChanged<T?>? onChanged;
  final String? hint;
  final String? errorText;
  final bool enabled;
  final String Function(T)? itemLabel;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final hasError = errorText != null && errorText!.isNotEmpty;
    final labelOf = itemLabel ?? (T v) => v.toString();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppTypography.label(color: t.textSecondary)),
        const SizedBox(height: AppSpacing.labelToInput),
        SizedBox(
          height: 48,
          child: DropdownButtonFormField<T>(
            value: value,
            items: items
                .map(
                  (item) => DropdownMenuItem<T>(
                    value: item,
                    child: Text(
                      labelOf(item),
                      style: AppTypography.body(color: t.textPrimary),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: enabled ? onChanged : null,
            hint: hint != null
                ? Text(hint!, style: AppTypography.body(color: t.placeholder))
                : null,
            icon: Icon(Icons.keyboard_arrow_down, color: t.textSecondary),
            decoration: InputDecoration(
              filled: !enabled,
              fillColor: enabled ? null : t.surfaceAlt,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 14,
              ),
              border: _border(t.borderStrong, 1),
              enabledBorder: _border(t.borderStrong, 1),
              focusedBorder: _border(hasError ? t.danger : t.focusRing, 2),
              errorBorder: _border(t.danger, 2),
              disabledBorder: _border(t.borderStrong, 1),
              errorText: null,
            ),
            isExpanded: true,
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: AppSpacing.s1),
          Text(errorText!, style: AppTypography.bodySmall(color: t.dangerText)),
        ],
      ],
    );
  }

  OutlineInputBorder _border(Color color, double width) {
    return OutlineInputBorder(
      borderRadius: AppRadius.borderSm,
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
