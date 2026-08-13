import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/typography.dart';

/// Canonical UI date format: `10 Aug 2026` — never `10/08/2026` or ISO.
String formatSawDate(DateTime d) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${d.day} ${months[d.month - 1]} ${d.year}';
}

/// Parses `YYYY-MM-DD` without timezone shift.
DateTime? parseIsoDateOnly(String iso) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
  if (m == null) return null;
  return DateTime(
    int.parse(m.group(1)!),
    int.parse(m.group(2)!),
    int.parse(m.group(3)!),
  );
}

class DateText extends StatelessWidget {
  const DateText({
    super.key,
    required this.value,
    this.style,
    this.color,
  });

  final DateTime value;
  final TextStyle? style;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Text(
      formatSawDate(value),
      style: style ?? AppTypography.body(color: color ?? t.textPrimary),
    );
  }
}
