import 'package:flutter/material.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../theme/theme_extensions.dart';
import 'app_text_field.dart';
import '../domain/date_text.dart';

/// Date field — label above, displays `10 Aug 2026` (never `10/08/2026`).
class AppDateField extends StatelessWidget {
  const AppDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.firstDate,
    this.lastDate,
    this.errorText,
    this.enabled = true,
    this.hint,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final DateTime? firstDate;
  final DateTime? lastDate;
  final String? errorText;
  final bool enabled;
  final String? hint;

  /// Canonical UI date format: `10 Aug 2026`.
  static String format(DateTime d) => formatSawDate(d);

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final display = value != null ? format(value!) : '';

    return GestureDetector(
      onTap: !enabled
          ? null
          : () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: value ?? DateTime.now(),
                firstDate: firstDate ?? DateTime(2000),
                lastDate: lastDate ?? DateTime(2100),
                builder: (ctx, child) => Theme(
                  data: Theme.of(context),
                  child: child!,
                ),
              );
              if (picked != null) onChanged(picked);
            },
      child: AbsorbPointer(
        child: AppTextField(
          label: label,
          hint: hint ?? 'Select date',
          errorText: errorText,
          enabled: enabled,
          controller: TextEditingController(text: display),
          suffix: Icon(
            PhosphorIconsRegular.calendarBlank,
            size: 20,
            color: t.textSecondary,
          ),
        ),
      ),
    );
  }
}

/// Standalone Indian-style date formatter for use outside [AppDateField].
String formatAppDate(DateTime d) => AppDateField.format(d);
