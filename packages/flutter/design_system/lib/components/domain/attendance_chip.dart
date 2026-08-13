import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../display/app_chip.dart';

/// Attendance status — fixed colours, never re-themed. Always shows a letter.
enum AttendanceStatus {
  present('P'),
  absent('A'),
  late_('L'),
  halfDay('H'),
  leave('E'),
  holiday('-');

  const AttendanceStatus(this.letter);
  final String letter;
}

/// Chip that carries letter P/A/L/H/E/- plus colour (colour-blind safe).
class AttendanceChip extends StatelessWidget {
  const AttendanceChip({super.key, required this.status});

  final AttendanceStatus status;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    final (Color bg, Color fg) = switch (status) {
      AttendanceStatus.present => (t.successBg, t.successText),
      AttendanceStatus.absent => (t.dangerBg, t.dangerText),
      AttendanceStatus.late_ => (t.warningBg, t.warningText),
      AttendanceStatus.halfDay => (t.infoBg, t.infoText),
      AttendanceStatus.leave => (t.surfaceAlt, t.textTertiary),
      AttendanceStatus.holiday => (t.disabledFill, t.textTertiary),
    };

    return AppChip(
      label: status.letter,
      backgroundColor: bg,
      foregroundColor: fg,
    );
  }
}
