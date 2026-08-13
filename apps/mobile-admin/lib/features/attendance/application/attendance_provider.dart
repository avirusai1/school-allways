import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/attendance_repository.dart';
import '../domain/roster.dart';

final attendanceRepositoryProvider = Provider<AttendanceRepository>((ref) {
  return AttendanceRepository(
    ref.watch(apiClientProvider),
    outbox: ref.watch(outboxWorkerProvider),
  );
});

/// Active section for marking — set from teacher home / section picker.
final activeSectionIdProvider = StateProvider<String?>((ref) => null);

final attendanceDayProvider = StateProvider<String>((ref) {
  return DateTime.now().toIso8601String().substring(0, 10);
});

class TakeAttendanceArgs {
  const TakeAttendanceArgs({
    required this.sectionId,
    required this.day,
    this.periodId,
  });

  final String sectionId;
  final String day;
  final String? periodId;

  @override
  bool operator ==(Object other) =>
      other is TakeAttendanceArgs &&
      other.sectionId == sectionId &&
      other.day == day &&
      other.periodId == periodId;

  @override
  int get hashCode => Object.hash(sectionId, day, periodId);
}

final rosterProvider =
    FutureProvider.autoDispose.family<AttendanceRoster, TakeAttendanceArgs>(
  (ref, args) {
    return ref.watch(attendanceRepositoryProvider).fetchRoster(
          sectionId: args.sectionId,
          day: args.day,
          periodId: args.periodId,
        );
  },
);

class MarksDraft {
  const MarksDraft({
    this.statuses = const {},
    this.remarks = const {},
  });

  final Map<String, MarkStatus> statuses;
  final Map<String, String> remarks;

  MarksDraft copyWith({
    Map<String, MarkStatus>? statuses,
    Map<String, String>? remarks,
  }) {
    return MarksDraft(
      statuses: statuses ?? this.statuses,
      remarks: remarks ?? this.remarks,
    );
  }
}

/// Local draft of marks — defaults everyone to Present.
class MarksDraftNotifier extends StateNotifier<MarksDraft> {
  MarksDraftNotifier(super.initial);

  void setStatus(String studentId, MarkStatus status) {
    state = state.copyWith(
      statuses: {...state.statuses, studentId: status},
    );
  }

  void setRemark(String studentId, String remark) {
    final next = Map<String, String>.from(state.remarks);
    if (remark.trim().isEmpty) {
      next.remove(studentId);
    } else {
      next[studentId] = remark.trim();
    }
    state = state.copyWith(remarks: next);
  }

  void markAllPresent() {
    state = state.copyWith(
      statuses: {
        for (final id in state.statuses.keys) id: MarkStatus.present,
      },
    );
  }

  void seedFromRoster(AttendanceRoster roster) {
    state = MarksDraft(
      statuses: {
        for (final s in roster.students)
          s.studentId: s.onApprovedLeave
              ? MarkStatus.absent
              : markFromApi(s.status),
      },
      remarks: {
        for (final s in roster.students)
          if (s.remarks != null && s.remarks!.isNotEmpty) s.studentId: s.remarks!,
      },
    );
  }
}

final marksDraftProvider = StateNotifierProvider.autoDispose
    .family<MarksDraftNotifier, MarksDraft, TakeAttendanceArgs>(
  (ref, args) {
    final roster = ref.watch(rosterProvider(args)).valueOrNull;
    final initial = MarksDraft(
      statuses: {
        if (roster != null)
          for (final s in roster.students)
            s.studentId: s.onApprovedLeave
                ? MarkStatus.absent
                : markFromApi(s.status),
      },
    );
    return MarksDraftNotifier(initial);
  },
);
