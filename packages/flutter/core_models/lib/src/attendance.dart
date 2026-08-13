enum AttendanceMark {
  present,
  absent,
  late_,
  halfDay,
  leave,
  holiday;

  static AttendanceMark fromApi(String value) {
    return switch (value) {
      'present' => AttendanceMark.present,
      'absent' => AttendanceMark.absent,
      'late' => AttendanceMark.late_,
      'half_day' => AttendanceMark.halfDay,
      'leave' => AttendanceMark.leave,
      'holiday' => AttendanceMark.holiday,
      _ => AttendanceMark.absent,
    };
  }

  String get apiValue => switch (this) {
        AttendanceMark.present => 'present',
        AttendanceMark.absent => 'absent',
        AttendanceMark.late_ => 'late',
        AttendanceMark.halfDay => 'half_day',
        AttendanceMark.leave => 'leave',
        AttendanceMark.holiday => 'holiday',
      };
}

class AttendanceEntryDto {
  const AttendanceEntryDto({
    required this.studentId,
    required this.status,
    this.note,
  });

  final String studentId;
  final AttendanceMark status;
  final String? note;

  factory AttendanceEntryDto.fromJson(Map<String, dynamic> json) {
    return AttendanceEntryDto(
      studentId: json['studentId'] as String,
      status: AttendanceMark.fromApi(json['status'] as String),
      note: json['note'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'studentId': studentId,
        'status': status.apiValue,
        'note': note,
      };
}
