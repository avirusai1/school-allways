import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/typography.dart';

/// Formats integer paise as Indian-grouped rupees: ₹12,50,000.50
///
/// Money is ALWAYS integer paise at rest (`₹1,250.50` = `125050`).
/// Never float; format only at the UI edge.
String formatIndianMoney(int paise, {bool showPaise = true}) {
  final negative = paise < 0;
  final abs = paise.abs();
  final rupees = abs ~/ 100;
  final fraction = abs % 100;
  final grouped = _indianGroup(rupees);
  final sign = negative ? '-' : '';
  if (!showPaise && fraction == 0) {
    return '$sign₹$grouped';
  }
  return '$sign₹$grouped.${fraction.toString().padLeft(2, '0')}';
}

/// Indian digit grouping: last 3, then pairs. `1250000` → `12,50,000`.
String formatIndianNumber(int value) {
  final negative = value < 0;
  final grouped = _indianGroup(value.abs());
  return negative ? '-$grouped' : grouped;
}

String _indianGroup(int n) {
  final s = n.toString();
  if (s.length <= 3) return s;
  final last3 = s.substring(s.length - 3);
  var rest = s.substring(0, s.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '${parts.join(',')},$last3';
}

/// Renders money with tabular figures and Indian grouping.
class MoneyText extends StatelessWidget {
  const MoneyText({
    super.key,
    required this.paise,
    this.showPaise = true,
    this.style,
    this.color,
    this.large = false,
  });

  /// Amount in integer paise.
  final int paise;
  final bool showPaise;
  final TextStyle? style;
  final Color? color;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final base = large
        ? AppTypography.numericLarge(color: color ?? t.textPrimary)
        : AppTypography.numeric(color: color ?? t.textPrimary);
    return Text(
      formatIndianMoney(paise, showPaise: showPaise),
      style: style ?? base,
    );
  }
}
