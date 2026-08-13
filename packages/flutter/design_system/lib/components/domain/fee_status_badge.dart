import 'package:flutter/material.dart';

import '../display/app_chip.dart';

/// Fee payment status badge.
enum FeeStatus { paid, due, overdue, partial, waived }

class FeeStatusBadge extends StatelessWidget {
  const FeeStatusBadge({super.key, required this.status});

  final FeeStatus status;

  @override
  Widget build(BuildContext context) {
    final (String label, AppChipTone tone) = switch (status) {
      FeeStatus.paid => ('Paid', AppChipTone.success),
      FeeStatus.due => ('Due', AppChipTone.warning),
      FeeStatus.overdue => ('Overdue', AppChipTone.danger),
      FeeStatus.partial => ('Partial', AppChipTone.info),
      FeeStatus.waived => ('Waived', AppChipTone.neutral),
    };
    return AppChip(label: label, tone: tone);
  }
}
