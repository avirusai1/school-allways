/// Family home feed models — mirrors GET /v1/family/home.
class FamilyHome {
  const FamilyHome({
    required this.student,
    required this.today,
    required this.needsAttention,
    required this.homeworkDue,
    required this.notices,
    this.bus,
    this.latestPhotos = const [],
    this.locked = false,
    this.status,
    this.graceEndsAt,
    this.expiresAt,
  });

  final FamilyStudent student;
  final TodayStrip today;
  final List<AttentionItem> needsAttention;
  final List<HomeworkDueItem> homeworkDue;
  final List<NoticeItem> notices;
  final BusCard? bus;
  final List<PhotoThumb> latestPhotos;

  /// True when the API returned the attendance-only locked home.
  final bool locked;

  /// `grace` / `active` / `locked` from the subscription snapshot.
  final String? status;
  final String? graceEndsAt;
  final String? expiresAt;

  bool get isQuiet =>
      !locked &&
      needsAttention.isEmpty &&
      homeworkDue.isEmpty &&
      notices.isEmpty &&
      bus == null &&
      latestPhotos.isEmpty;

  factory FamilyHome.fromJson(Map<String, dynamic> json) {
    final subscription = json['subscription'] is Map<String, dynamic>
        ? json['subscription'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return FamilyHome(
      locked: json['locked'] as bool? ?? false,
      status: json['status'] as String? ?? subscription['status'] as String?,
      graceEndsAt: json['graceEndsAt'] as String? ??
          subscription['graceEndsAt'] as String?,
      expiresAt:
          json['expiresAt'] as String? ?? subscription['expiresAt'] as String?,
      student: FamilyStudent.fromJson(
        json['student'] as Map<String, dynamic>? ?? const {},
      ),
      today: TodayStrip.fromJson(
        json['today'] as Map<String, dynamic>? ?? const {},
      ),
      needsAttention: (json['needsAttention'] as List<dynamic>? ?? const [])
          .map((e) => AttentionItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      homeworkDue: (json['homeworkDue'] as List<dynamic>? ?? const [])
          .map((e) => HomeworkDueItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      notices: (json['notices'] as List<dynamic>? ?? const [])
          .map((e) => NoticeItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      bus: json['bus'] is Map<String, dynamic>
          ? BusCard.fromJson(json['bus'] as Map<String, dynamic>)
          : null,
      latestPhotos: (json['latestPhotos'] as List<dynamic>? ?? const [])
          .map((e) => PhotoThumb.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'locked': locked,
        'status': status,
        'graceEndsAt': graceEndsAt,
        'expiresAt': expiresAt,
        'subscription': {
          'status': status,
          'graceEndsAt': graceEndsAt,
          'expiresAt': expiresAt,
        },
        'student': student.toJson(),
        'today': today.toJson(),
        'needsAttention': needsAttention.map((e) => e.toJson()).toList(),
        'homeworkDue': homeworkDue.map((e) => e.toJson()).toList(),
        'notices': notices.map((e) => e.toJson()).toList(),
        'bus': bus?.toJson(),
        'latestPhotos': latestPhotos.map((e) => e.toJson()).toList(),
      };

  factory FamilyHome.empty({required String studentId, required String name}) {
    return FamilyHome(
      student: FamilyStudent(
        id: studentId,
        fullName: name,
        firstName: name,
      ),
      today: TodayStrip(
        label: 'TODAY',
        day: DateTime.now().toIso8601String().substring(0, 10),
        attendanceLabel: '—',
        homeworkDueCount: 0,
        feesDuePaise: 0,
      ),
      needsAttention: const [],
      homeworkDue: const [],
      notices: const [],
    );
  }
}

class FamilyStudent {
  const FamilyStudent({
    required this.id,
    required this.fullName,
    required this.firstName,
    this.lastName,
    this.photoPath,
    this.sectionId,
    this.rollNo,
  });

  final String id;
  final String fullName;
  final String firstName;
  final String? lastName;
  final String? photoPath;
  final String? sectionId;
  final String? rollNo;

  factory FamilyStudent.fromJson(Map<String, dynamic> json) {
    return FamilyStudent(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      firstName: json['firstName'] as String? ?? '',
      lastName: json['lastName'] as String?,
      photoPath: json['photoPath'] as String?,
      sectionId: json['sectionId'] as String?,
      rollNo: json['rollNo'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'firstName': firstName,
        'lastName': lastName,
        'photoPath': photoPath,
        'sectionId': sectionId,
        'rollNo': rollNo,
      };
}

class TodayStrip {
  const TodayStrip({
    required this.label,
    required this.day,
    required this.attendanceLabel,
    required this.homeworkDueCount,
    required this.feesDuePaise,
    this.attendanceStatus,
  });

  final String label;
  final String day;
  final String attendanceLabel;
  final String? attendanceStatus;
  final int homeworkDueCount;
  final int feesDuePaise;

  factory TodayStrip.fromJson(Map<String, dynamic> json) {
    final attendance = json['attendance'] as Map<String, dynamic>? ?? const {};
    return TodayStrip(
      label: json['label'] as String? ?? 'TODAY',
      day: json['day'] as String? ?? '',
      attendanceLabel: attendance['label'] as String? ?? '—',
      attendanceStatus: attendance['status'] as String?,
      homeworkDueCount: json['homeworkDueCount'] as int? ?? 0,
      feesDuePaise: json['feesDuePaise'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'label': label,
        'day': day,
        'attendance': {
          'label': attendanceLabel,
          'status': attendanceStatus,
        },
        'homeworkDueCount': homeworkDueCount,
        'feesDuePaise': feesDuePaise,
      };
}

class AttentionItem {
  const AttentionItem({
    required this.severity,
    required this.title,
    required this.route,
  });

  final String severity;
  final String title;
  final String route;

  factory AttentionItem.fromJson(Map<String, dynamic> json) {
    return AttentionItem(
      severity: json['severity'] as String? ?? 'blue',
      title: json['title'] as String? ?? '',
      route: json['route'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'severity': severity,
        'title': title,
        'route': route,
      };
}

class HomeworkDueItem {
  const HomeworkDueItem({
    required this.id,
    required this.title,
    this.dueOn,
    this.dueToday = false,
    this.subjectId,
  });

  final String id;
  final String title;
  final String? dueOn;
  final bool dueToday;
  final String? subjectId;

  factory HomeworkDueItem.fromJson(Map<String, dynamic> json) {
    return HomeworkDueItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      dueOn: json['dueOn'] as String?,
      dueToday: json['dueToday'] as bool? ?? false,
      subjectId: json['subjectId'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'dueOn': dueOn,
        'dueToday': dueToday,
        'subjectId': subjectId,
      };
}

class NoticeItem {
  const NoticeItem({
    required this.id,
    required this.title,
    this.preview,
    this.publishedAt,
    this.unread = false,
  });

  final String id;
  final String title;
  final String? preview;
  final String? publishedAt;
  final bool unread;

  factory NoticeItem.fromJson(Map<String, dynamic> json) {
    return NoticeItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      preview: json['preview'] as String?,
      publishedAt: json['publishedAt'] as String?,
      unread: json['unread'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'preview': preview,
        'publishedAt': publishedAt,
        'unread': unread,
      };
}

class BusCard {
  const BusCard({
    required this.routeName,
    required this.stopsAway,
    required this.eta,
  });

  final String routeName;
  final int stopsAway;
  final String eta;

  factory BusCard.fromJson(Map<String, dynamic> json) {
    return BusCard(
      routeName: json['routeName'] as String? ?? '',
      stopsAway: json['stopsAway'] as int? ?? 0,
      eta: json['eta'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'routeName': routeName,
        'stopsAway': stopsAway,
        'eta': eta,
      };
}

class PhotoThumb {
  const PhotoThumb({required this.id, required this.thumbUrl});

  final String id;
  final String thumbUrl;

  factory PhotoThumb.fromJson(Map<String, dynamic> json) {
    return PhotoThumb(
      id: json['id'] as String? ?? '',
      thumbUrl: json['thumbUrl'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {'id': id, 'thumbUrl': thumbUrl};
}

class ChildSummary {
  const ChildSummary({
    required this.id,
    required this.fullName,
    this.firstName,
    this.photoPath,
    this.subscribed = true,
    this.status,
    this.expiresAt,
    this.graceEndsAt,
  });

  final String id;
  final String fullName;
  final String? firstName;
  final String? photoPath;
  final bool subscribed;

  /// `grace` / `active` / `locked`.
  final String? status;
  final String? expiresAt;
  final String? graceEndsAt;

  bool get isLocked => !subscribed || status == 'locked';

  String get displayName =>
      (firstName != null && firstName!.isNotEmpty) ? firstName! : fullName;

  factory ChildSummary.fromJson(Map<String, dynamic> json) {
    return ChildSummary(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      firstName: json['firstName'] as String?,
      photoPath: json['photoPath'] as String?,
      subscribed: json['subscribed'] as bool? ?? true,
      status: json['status'] as String?,
      expiresAt: json['expiresAt'] as String?,
      graceEndsAt: json['graceEndsAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'firstName': firstName,
        'photoPath': photoPath,
        'subscribed': subscribed,
        'status': status,
        'expiresAt': expiresAt,
        'graceEndsAt': graceEndsAt,
      };
}
