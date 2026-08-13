import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/sync_chrome.dart';
import '../../../router/routes.dart';
import '../application/attendance_provider.dart';
import '../domain/roster.dart';

/// The 20-second attendance screen — Compact density, defaults to Present.
class TakeAttendanceScreen extends ConsumerStatefulWidget {
  const TakeAttendanceScreen({
    super.key,
    required this.sectionId,
    this.day,
    this.periodId,
  });

  final String sectionId;
  final String? day;
  final String? periodId;

  @override
  ConsumerState<TakeAttendanceScreen> createState() =>
      _TakeAttendanceScreenState();
}

class _TakeAttendanceScreenState extends ConsumerState<TakeAttendanceScreen> {
  String? _savedMessage;
  String? _error;
  var _amending = false;
  String? _amendReason;
  final _flash = <String, Color?>{};
  var _daySeeded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_daySeeded && widget.day != null && widget.day!.isNotEmpty) {
      _daySeeded = true;
      Future.microtask(() {
        ref.read(attendanceDayProvider.notifier).state = widget.day!;
      });
    }
  }

  TakeAttendanceArgs get _args => TakeAttendanceArgs(
        sectionId: widget.sectionId,
        day: ref.watch(attendanceDayProvider),
        periodId: widget.periodId,
      );

  Future<void> _submit(AttendanceRoster roster, {bool force = false}) async {
    final draft = ref.read(marksDraftProvider(_args));
    if (draft.statuses.isEmpty) return;

    final locked = roster.register.isLocked && !_amending;
    if (locked) return;

    setState(() {
      _error = null;
      _savedMessage = 'Saved · will sync';
    });

    try {
      final repo = ref.read(attendanceRepositoryProvider);
      if (_amending && roster.register.id != null) {
        await repo.amend(
          registerId: roster.register.id!,
          marks: draft.statuses,
          remarks: {
            for (final e in draft.remarks.entries) e.key: e.value,
          },
          reason: _amendReason ?? 'Attendance correction',
        );
      } else {
        await repo.enqueueSubmit(
          sectionId: roster.register.sectionId,
          academicSessionId: roster.register.academicSessionId,
          day: roster.register.day,
          periodId: roster.register.periodId,
          marks: draft.statuses,
          remarks: {
            for (final e in draft.remarks.entries) e.key: e.value,
          },
          force: force,
        );
      }
      if (!mounted) return;
      // Spec: no spinner, no wait — pop immediately.
      context.pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _savedMessage = null;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _savedMessage = null;
        _error = 'Could not queue attendance. Try again.';
      });
    }
  }

  void _select(String studentId, MarkStatus status) {
    HapticFeedback.selectionClick();
    ref.read(marksDraftProvider(_args).notifier).setStatus(studentId, status);
    final t = context.tokens;
    final flash = switch (status) {
      MarkStatus.present => t.successBg,
      MarkStatus.absent => t.dangerBg,
      MarkStatus.late => t.warningBg,
    };
    setState(() => _flash[studentId] = flash);
    Future<void>.delayed(const Duration(milliseconds: 160), () {
      if (!mounted) return;
      setState(() => _flash[studentId] = null);
    });
  }

  Future<void> _pickDay() async {
    final current = DateTime.tryParse(ref.read(attendanceDayProvider)) ??
        DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: current.subtract(const Duration(days: 30)),
      lastDate: current.add(const Duration(days: 7)),
    );
    if (picked == null) return;
    final key =
        '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    ref.read(attendanceDayProvider.notifier).state = key;
  }

  Future<void> _longPressStudent(RosterStudent student) async {
    final controller = TextEditingController(
      text: ref.read(marksDraftProvider(_args)).remarks[student.studentId] ?? '',
    );
    final saved = await showAppBottomSheet<bool>(
      context: context,
      child: Padding(
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
            Text(
              student.fullName,
              style: AppTypography.h3(color: context.tokens.textPrimary),
            ),
            const SizedBox(height: AppSpacing.s3),
            AppTextField(
              controller: controller,
              label: 'Remarks',
              hint: 'Optional note for this mark',
              maxLines: 2,
            ),
            const SizedBox(height: AppSpacing.s4),
            AppButton(
              label: 'Save',
              expanded: true,
              onPressed: () => Navigator.of(context).pop(true),
            ),
          ],
        ),
      ),
    );
    if (saved == true && mounted) {
      ref
          .read(marksDraftProvider(_args).notifier)
          .setRemark(student.studentId, controller.text);
    }
    controller.dispose();
  }

  Future<void> _startAmend(AttendanceRoster roster) async {
    final controller = TextEditingController();
    final ok = await showAppBottomSheet<bool>(
      context: context,
      child: Padding(
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
            Text(
              'Request amendment',
              style: AppTypography.h3(color: context.tokens.textPrimary),
            ),
            const SizedBox(height: AppSpacing.s2),
            Text(
              'Explain why this register needs correcting. Changes sync via amend.',
              style: AppTypography.bodySmall(color: context.tokens.textTertiary),
            ),
            const SizedBox(height: AppSpacing.s3),
            AppTextField(
              controller: controller,
              label: 'Reason',
              maxLines: 3,
            ),
            const SizedBox(height: AppSpacing.s4),
            AppButton(
              label: 'Unlock for amendment',
              expanded: true,
              onPressed: () {
                if (controller.text.trim().length < 5) return;
                Navigator.of(context).pop(true);
              },
            ),
          ],
        ),
      ),
    );
    if (ok == true && mounted) {
      setState(() {
        _amending = true;
        _amendReason = controller.text.trim();
      });
    }
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final day = ref.watch(attendanceDayProvider);
    final async = ref.watch(rosterProvider(_args));

    return async.when(
      loading: () => Scaffold(
        backgroundColor: t.appBackground,
        appBar: const SawAppBar(title: 'Attendance'),
        body: const Padding(
          padding: EdgeInsets.all(AppSpacing.s4),
          child: SkeletonList(count: 10, rowHeight: 44),
        ),
      ),
      error: (e, _) => Scaffold(
        backgroundColor: t.appBackground,
        appBar: const SawAppBar(title: 'Attendance'),
        body: Padding(
          padding: const EdgeInsets.all(AppSpacing.s4),
          child: ErrorState(
            message: 'Could not load roster.',
            onRetry: () => ref.invalidate(rosterProvider(_args)),
          ),
        ),
      ),
      data: (roster) {
        if (roster.meta.isHoliday && !_amending) {
          return Scaffold(
            backgroundColor: t.appBackground,
            appBar: SawAppBar(title: roster.register.sectionLabel),
            body: EmptyState(
              icon: PhosphorIconsRegular.calendarBlank,
              headline: roster.meta.holidayTitle ?? 'Holiday',
              body: 'Today is marked as a holiday on the school calendar.',
              actionLabel: 'Mark anyway',
              onAction: () => _submit(roster, force: true),
            ),
          );
        }

        final draft = ref.watch(marksDraftProvider(_args));
        if (draft.statuses.isEmpty && roster.students.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ref.read(marksDraftProvider(_args).notifier).seedFromRoster(roster);
          });
        }

        final marks = draft.statuses;
        final present =
            marks.values.where((s) => s == MarkStatus.present).length;
        final absent =
            marks.values.where((s) => s == MarkStatus.absent).length;
        final late = marks.values.where((s) => s == MarkStatus.late).length;
        final marked = marks.length;
        final total = roster.students.length;
        final locked = roster.register.isLocked && !_amending;

        return Scaffold(
          backgroundColor: t.appBackground,
          appBar: SawAppBar(
            title: '${roster.register.sectionLabel} · Attendance',
            actions: [
              const PendingSyncChip(),
              TextButton(
                onPressed: _pickDay,
                child: Text(day),
              ),
              if (_savedMessage != null)
                Padding(
                  padding: const EdgeInsets.only(right: AppSpacing.s3),
                  child: Center(
                    child: Text(
                      _savedMessage!,
                      style: AppTypography.caption(color: t.successText),
                    ),
                  ),
                ),
            ],
          ),
          body: Column(
            children: [
              const OfflineBanner(),
              Container(
                height: 48,
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
                decoration: BoxDecoration(
                  color: t.surfaceAlt,
                  border: Border(bottom: BorderSide(color: t.border)),
                ),
                child: Row(
                  children: [
                    _dot(t.attendancePresent, '$present Present'),
                    const SizedBox(width: AppSpacing.s3),
                    _dot(t.attendanceAbsent, '$absent Absent'),
                    const SizedBox(width: AppSpacing.s3),
                    _dot(t.attendanceLate, '$late Late'),
                    const Spacer(),
                    if (!locked)
                      AppButton(
                        label: 'Mark all present',
                        variant: AppButtonVariant.ghost,
                        size: AppButtonSize.inline,
                        onPressed: () {
                          HapticFeedback.selectionClick();
                          ref
                              .read(marksDraftProvider(_args).notifier)
                              .markAllPresent();
                        },
                      ),
                  ],
                ),
              ),
              if (_amending && _amendReason != null)
                Material(
                  color: t.warningBg,
                  child: ListTile(
                    dense: true,
                    title: Text(
                      'Amending · $_amendReason',
                      style: AppTypography.bodySmall(color: t.warningText),
                    ),
                  ),
                ),
              if (_error != null) ErrorState(message: _error!),
              Expanded(
                child: ListView.builder(
                  itemCount: roster.students.length,
                  itemBuilder: (context, index) {
                    final student = roster.students[index];
                    final status =
                        marks[student.studentId] ?? MarkStatus.present;
                    final bg = _flash[student.studentId];
                    return GestureDetector(
                      onLongPress: locked
                          ? null
                          : () => _longPressStudent(student),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 160),
                        color: bg ?? t.surface,
                        height: 44,
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.s4,
                        ),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 28,
                              child: Text(
                                student.rollNo ?? '${index + 1}',
                                style: AppTypography.caption(
                                  color: t.textTertiary,
                                ),
                              ),
                            ),
                            Expanded(
                              child: Text(
                                student.fullName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.bodyMedium(
                                  color: t.textPrimary,
                                ),
                              ),
                            ),
                            if (student.onApprovedLeave)
                              Padding(
                                padding: const EdgeInsets.only(
                                  right: AppSpacing.s2,
                                ),
                                child: AppChip(
                                  label: 'On leave',
                                  tone: AppChipTone.info,
                                ),
                              ),
                            if (draft.remarks[student.studentId] != null)
                              Padding(
                                padding: const EdgeInsets.only(
                                  right: AppSpacing.s1,
                                ),
                                child: Icon(
                                  PhosphorIconsRegular.note,
                                  size: 14,
                                  color: t.textTertiary,
                                ),
                              ),
                            _Segment(
                              selected: status,
                              enabled: !locked,
                              onSelect: (s) =>
                                  _select(student.studentId, s),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              SafeArea(
                top: false,
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.s3),
                  decoration: BoxDecoration(
                    color: t.surface,
                    border: Border(top: BorderSide(color: t.border)),
                  ),
                  child: locked
                      ? AppButton(
                          label: 'Request amendment',
                          variant: AppButtonVariant.outline,
                          expanded: true,
                          onPressed: () => _startAmend(roster),
                        )
                      : AppButton(
                          label:
                              'Submit attendance · $marked of $total marked',
                          expanded: true,
                          onPressed: () => _submit(roster),
                        ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _dot(Color color, String label) {
    final t = context.tokens;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label, style: AppTypography.caption(color: t.textSecondary)),
      ],
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.selected,
    required this.onSelect,
    this.enabled = true,
  });

  final MarkStatus selected;
  final ValueChanged<MarkStatus> onSelect;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final status in MarkStatus.values)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: enabled ? () => onSelect(status) : null,
                borderRadius: AppRadius.borderSm,
                child: Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: selected == status
                        ? switch (status) {
                            MarkStatus.present => t.attendancePresent,
                            MarkStatus.absent => t.attendanceAbsent,
                            MarkStatus.late => t.attendanceLate,
                          }
                        : t.surfaceAlt,
                    borderRadius: AppRadius.borderSm,
                  ),
                  child: Text(
                    status.letter,
                    style: AppTypography.label(
                      color: selected == status
                          ? t.textOnPrimary
                          : t.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Section picker before marking — uses session scope section IDs.
class AttendanceHubScreen extends ConsumerWidget {
  const AttendanceHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider).valueOrNull;
    final sectionIds = session?.scopes.sectionIds ?? const <String>[];
    final day = ref.watch(attendanceDayProvider);

    return Column(
      children: [
        const SawAppBar(
          title: 'Take attendance',
          actions: [PendingSyncChip()],
        ),
        const OfflineBanner(),
        Expanded(
          child: sectionIds.isEmpty
              ? EmptyState(
                  icon: PhosphorIconsRegular.chalkboardTeacher,
                  headline: 'No sections assigned',
                  body:
                      'Ask your school admin to assign you a class section.',
                )
              : ListView.builder(
                  itemCount: sectionIds.length,
                  itemBuilder: (context, index) {
                    final id = sectionIds[index];
                    return AppListTile(
                      title: 'Section',
                      subtitle: id,
                      showChevron: true,
                      dense: true,
                      onTap: () {
                        ref.read(activeSectionIdProvider.notifier).state = id;
                        context.push(
                          '${AdminRoutes.takeAttendance}?sectionId=$id&day=$day',
                        );
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }
}
