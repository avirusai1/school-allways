import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/paywall.dart';
import '../../../core/providers.dart';
import '../../home/application/family_home_provider.dart';
import '../../paywall/presentation/paywall_panel.dart';

Future<void> showLeaveRequestSheet(BuildContext context, WidgetRef ref) {
  return showAppBottomSheet(
    context: context,
    child: const _LeaveRequestSheet(),
  );
}

class _LeaveRequestSheet extends ConsumerStatefulWidget {
  const _LeaveRequestSheet();

  @override
  ConsumerState<_LeaveRequestSheet> createState() => _LeaveRequestSheetState();
}

class _LeaveRequestSheetState extends ConsumerState<_LeaveRequestSheet> {
  DateTimeRange? _range;
  final _reason = TextEditingController();
  String? _error;
  bool _submitting = false;
  bool _submitted = false;
  bool _paywall = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 90)),
      initialDateRange: _range ??
          DateTimeRange(start: now, end: now.add(const Duration(days: 1))),
    );
    if (picked != null) setState(() => _range = picked);
  }

  Future<void> _submit() async {
    final reason = _reason.text.trim();
    if (_range == null) {
      setState(() => _error = 'Choose leave dates');
      return;
    }
    if (reason.length < 10) {
      setState(() => _error = 'Reason must be at least 10 characters');
      return;
    }
    final studentId = ref.read(childSwitcherProvider).valueOrNull;
    if (studentId == null || studentId.isEmpty) {
      setState(() => _error = 'Select a child first');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    // Optimistic: show Pending immediately.
    setState(() => _submitted = true);

    try {
      String iso(DateTime d) =>
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/family/leave',
        data: {
          'studentId': studentId,
          'fromDate': iso(_range!.start),
          'toDate': iso(_range!.end),
          'reason': reason,
        },
      );
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      if (isSubscriptionRequired(e)) {
        setState(() {
          _submitted = false;
          _submitting = false;
          _paywall = true;
          _error = null;
        });
        return;
      }
      setState(() {
        _submitted = false;
        _error = e.toString();
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final child = ref.watch(selectedChildProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.s4,
        0,
        AppSpacing.s4,
        AppSpacing.s6,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_paywall)
            PaywallPanel(
              studentName: child?.displayName,
              status: child?.status,
              graceEndsAt: child?.graceEndsAt,
            )
          else ...[
          Text('Apply for leave', style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s4),
          AppListTile(
            title: _range == null
                ? 'Select dates'
                : '${_fmt(_range!.start)} → ${_fmt(_range!.end)}',
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: _pickRange,
          ),
          const SizedBox(height: AppSpacing.s3),
          AppTextField(
            controller: _reason,
            label: 'Reason',
            maxLines: 3,
            errorText: _error,
          ),
          if (_submitted)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.s2),
              child: Text(
                'Pending',
                style: AppTypography.bodySmall(color: t.warningText),
              ),
            ),
          const SizedBox(height: AppSpacing.s4),
          AppButton(
            label: _submitting ? 'Submitting…' : 'Submit leave request',
            expanded: true,
            onPressed: _submitting ? null : _submit,
          ),
          ],
        ],
      ),
    );
  }

  String _fmt(DateTime d) =>
      '${d.day} ${_month(d.month)} ${d.year}';

  String _month(int m) {
    const names = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return names[m - 1];
  }
}
