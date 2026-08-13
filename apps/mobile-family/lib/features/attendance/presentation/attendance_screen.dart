import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import 'leave_request_sheet.dart';

class AttendanceDay {
  const AttendanceDay({required this.day, required this.status});

  final String day;
  final String status;
}

class AttendanceCalendar {
  const AttendanceCalendar({
    required this.studentId,
    required this.month,
    required this.days,
  });

  final String studentId;
  final String month;
  final List<AttendanceDay> days;

  factory AttendanceCalendar.fromJson(Map<String, dynamic> json) {
    return AttendanceCalendar(
      studentId: json['studentId'] as String? ?? '',
      month: json['month'] as String? ?? '',
      days: (json['days'] as List<dynamic>? ?? const [])
          .map(
            (e) => AttendanceDay(
              day: (e as Map<String, dynamic>)['day'] as String? ?? '',
              status: e['status'] as String? ?? '',
            ),
          )
          .toList(),
    );
  }

  Map<String, String> get byDay => {
        for (final d in days) d.day: d.status,
      };

  int get presentCount =>
      days.where((d) => d.status == 'present' || d.status == 'late').length;

  int get absentCount => days.where((d) => d.status == 'absent').length;

  int get lateCount => days.where((d) => d.status == 'late').length;

  double get presentPercent {
    if (days.isEmpty) return 0;
    return (presentCount / days.length) * 100;
  }
}

final attendanceMonthProvider = StateProvider<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime(now.year, now.month);
});

final attendanceCalendarProvider =
    FutureProvider.autoDispose<AttendanceCalendar>((ref) async {
  final studentId = ref.watch(childSwitcherProvider).valueOrNull;
  if (studentId == null || studentId.isEmpty) {
    return const AttendanceCalendar(studentId: '', month: '', days: []);
  }
  final month = ref.watch(attendanceMonthProvider);
  final key =
      '${month.year}-${month.month.toString().padLeft(2, '0')}';
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/attendance/student/$studentId/calendar',
    queryParameters: {'month': key},
  );
  return AttendanceCalendar.fromJson(res.data ?? const {});
});

class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final month = ref.watch(attendanceMonthProvider);
    final cal = ref.watch(attendanceCalendarProvider);

    return Column(
      children: [
        const SawAppBar(title: 'Attendance'),
        Expanded(
          child: cal.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 4),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: ErrorState(
                message: 'Could not load attendance.',
                onRetry: () => ref.invalidate(attendanceCalendarProvider),
              ),
            ),
            data: (data) {
              return ListView(
                padding: const EdgeInsets.all(AppSpacing.s4),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${data.presentPercent.toStringAsFixed(1)}%',
                          style: AppTypography.numericLarge(color: t.success),
                        ),
                        Text(
                          'Present this term',
                          style: AppTypography.caption(color: t.textTertiary),
                        ),
                        const SizedBox(height: AppSpacing.s3),
                        Row(
                          children: [
                            _stat(context, 'P', '${data.presentCount}', t.success),
                            const SizedBox(width: AppSpacing.s4),
                            _stat(context, 'A', '${data.absentCount}', t.danger),
                            const SizedBox(width: AppSpacing.s4),
                            _stat(context, 'L', '${data.lateCount}', t.warning),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  Row(
                    children: [
                      IconButton(
                        onPressed: () {
                          ref.read(attendanceMonthProvider.notifier).state =
                              DateTime(month.year, month.month - 1);
                        },
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Expanded(
                        child: Text(
                          _monthLabel(month),
                          textAlign: TextAlign.center,
                          style: AppTypography.h3(color: t.textPrimary),
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          ref.read(attendanceMonthProvider.notifier).state =
                              DateTime(month.year, month.month + 1);
                        },
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.s3),
                  _MonthGrid(
                    month: month,
                    byDay: data.byDay,
                    onDayTap: (day, status) {
                      showAppBottomSheet(
                        context: context,
                        child: _DaySheet(
                          day: day,
                          status: status,
                          onApplyLeave: () {
                            Navigator.of(context).pop();
                            showLeaveRequestSheet(context, ref);
                          },
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  Row(
                    children: [
                      _legend(context, 'P', t.attendancePresent),
                      const SizedBox(width: AppSpacing.s3),
                      _legend(context, 'A', t.attendanceAbsent),
                      const SizedBox(width: AppSpacing.s3),
                      _legend(context, 'L', t.attendanceLate),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _stat(BuildContext context, String letter, String value, Color color) {
    final t = context.tokens;
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: '$letter ',
            style: AppTypography.label(color: color),
          ),
          TextSpan(
            text: value,
            style: AppTypography.bodyMedium(color: t.textPrimary),
          ),
        ],
      ),
    );
  }

  Widget _legend(BuildContext context, String letter, Color color) {
    final t = context.tokens;
    return Row(
      children: [
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          child: Text(letter, style: AppTypography.caption(color: t.textOnPrimary)),
        ),
      ],
    );
  }

  String _monthLabel(DateTime m) {
    const names = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${names[m.month - 1]} ${m.year}';
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.byDay,
    required this.onDayTap,
  });

  final DateTime month;
  final Map<String, String> byDay;
  final void Function(String day, String? status) onDayTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final first = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    // Monday-first grid: weekday 1=Mon ... 7=Sun
    final leading = first.weekday - 1;
    final today = DateTime.now();
    final cells = leading + daysInMonth;

    return Column(
      children: [
        Row(
          children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
              .map(
                (d) => Expanded(
                  child: Center(
                    child: Text(d, style: AppTypography.caption(color: t.textTertiary)),
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: AppSpacing.s2),
        for (var row = 0; row < (cells / 7).ceil(); row++)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.s2),
            child: Row(
              children: List.generate(7, (col) {
                final index = row * 7 + col;
                final dayNum = index - leading + 1;
                if (dayNum < 1 || dayNum > daysInMonth) {
                  return const Expanded(child: SizedBox(height: 40));
                }
                final key =
                    '${month.year}-${month.month.toString().padLeft(2, '0')}-${dayNum.toString().padLeft(2, '0')}';
                final status = byDay[key];
                final isToday = today.year == month.year &&
                    today.month == month.month &&
                    today.day == dayNum;
                final fill = switch (status) {
                  'present' => t.attendancePresent,
                  'absent' => t.attendanceAbsent,
                  'late' => t.attendanceLate,
                  'half_day' => t.attendanceHalfDay,
                  'leave' || 'on_leave' => t.attendanceLeave,
                  _ => t.disabledFill,
                };
                final letter = switch (status) {
                  'present' => 'P',
                  'absent' => 'A',
                  'late' => 'L',
                  'half_day' => 'H',
                  'leave' || 'on_leave' => 'V',
                  _ => '$dayNum',
                };

                return Expanded(
                  child: Center(
                    child: InkWell(
                      onTap: () => onDayTap(key, status),
                      customBorder: const CircleBorder(),
                      child: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: status == null ? Colors.transparent : fill,
                          shape: BoxShape.circle,
                          border: isToday
                              ? Border.all(color: t.primary, width: 2)
                              : null,
                        ),
                        child: Text(
                          status == null ? '$dayNum' : letter,
                          style: AppTypography.caption(
                            color: status == null
                                ? t.textPrimary
                                : t.textOnPrimary,
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
      ],
    );
  }
}

class _DaySheet extends StatelessWidget {
  const _DaySheet({
    required this.day,
    required this.status,
    required this.onApplyLeave,
  });

  final String day;
  final String? status;
  final VoidCallback onApplyLeave;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final label = switch (status) {
      'present' => 'Present',
      'absent' => 'Absent',
      'late' => 'Late',
      'half_day' => 'Half day',
      'leave' || 'on_leave' => 'On leave',
      _ => 'No mark',
    };
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
          Text(day, style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s2),
          Text(label, style: AppTypography.body(color: t.textPrimary)),
          Text(
            'In-time and remarks appear when the school records them.',
            style: AppTypography.bodySmall(color: t.textTertiary),
          ),
          if (status == 'absent' || status == null) ...[
            const SizedBox(height: AppSpacing.s4),
            AppButton(
              label: 'Apply for leave',
              expanded: true,
              onPressed: onApplyLeave,
            ),
          ],
        ],
      ),
    );
  }
}
