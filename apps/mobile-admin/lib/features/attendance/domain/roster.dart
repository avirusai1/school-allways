/// Attendance roster models — mirrors GET /attendance/roster.
class AttendanceRoster {
  const AttendanceRoster({
    required this.register,
    required this.students,
    required this.meta,
  });

  final RosterRegister register;
  final List<RosterStudent> students;
  final RosterMeta meta;

  factory AttendanceRoster.fromJson(Map<String, dynamic> json) {
    return AttendanceRoster(
      register: RosterRegister.fromJson(
        json['register'] as Map<String, dynamic>? ?? const {},
      ),
      students: (json['students'] as List<dynamic>? ?? const [])
          .map((e) => RosterStudent.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: RosterMeta.fromJson(
        json['meta'] as Map<String, dynamic>? ?? const {},
      ),
    );
  }
}

class RosterRegister {
  const RosterRegister({
    required this.sectionId,
    required this.sectionLabel,
    required this.academicSessionId,
    required this.day,
    this.id,
    this.periodId,
    this.mode = 'daily',
    this.isLocked = false,
    this.markedAt,
    this.markedByName,
  });

  final String? id;
  final String sectionId;
  final String sectionLabel;
  final String academicSessionId;
  final String day;
  final String? periodId;
  final String mode;
  final bool isLocked;
  final String? markedAt;
  final String? markedByName;

  factory RosterRegister.fromJson(Map<String, dynamic> json) {
    return RosterRegister(
      id: json['id'] as String?,
      sectionId: json['sectionId'] as String? ?? '',
      sectionLabel: json['sectionLabel'] as String? ?? '',
      academicSessionId: json['academicSessionId'] as String? ?? '',
      day: json['day'] as String? ?? '',
      periodId: json['periodId'] as String?,
      mode: json['mode'] as String? ?? 'daily',
      isLocked: json['isLocked'] as bool? ?? false,
      markedAt: json['markedAt'] as String?,
      markedByName: json['markedByName'] as String?,
    );
  }
}

class RosterStudent {
  const RosterStudent({
    required this.studentId,
    required this.fullName,
    this.rollNo,
    this.photoUrl,
    this.status = 'not_marked',
    this.onApprovedLeave = false,
    this.remarks,
  });

  final String studentId;
  final String fullName;
  final String? rollNo;
  final String? photoUrl;
  final String status;
  final bool onApprovedLeave;
  final String? remarks;

  factory RosterStudent.fromJson(Map<String, dynamic> json) {
    return RosterStudent(
      studentId: json['studentId'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      rollNo: json['rollNo'] as String?,
      photoUrl: json['photoUrl'] as String?,
      status: json['status'] as String? ?? 'not_marked',
      onApprovedLeave: json['onApprovedLeave'] as bool? ?? false,
      remarks: json['remarks'] as String?,
    );
  }
}

class RosterMeta {
  const RosterMeta({
    required this.total,
    this.isHoliday = false,
    this.holidayTitle,
  });

  final int total;
  final bool isHoliday;
  final String? holidayTitle;

  factory RosterMeta.fromJson(Map<String, dynamic> json) {
    return RosterMeta(
      total: json['total'] as int? ?? 0,
      isHoliday: json['isHoliday'] as bool? ?? false,
      holidayTitle: json['holidayTitle'] as String?,
    );
  }
}

enum MarkStatus { present, absent, late }

extension MarkStatusApi on MarkStatus {
  String get apiValue => name;

  String get letter => switch (this) {
        MarkStatus.present => 'P',
        MarkStatus.absent => 'A',
        MarkStatus.late => 'L',
      };
}

MarkStatus markFromApi(String status) {
  return switch (status) {
    'absent' => MarkStatus.absent,
    'late' => MarkStatus.late,
    'present' || 'not_marked' || _ => MarkStatus.present,
  };
}
