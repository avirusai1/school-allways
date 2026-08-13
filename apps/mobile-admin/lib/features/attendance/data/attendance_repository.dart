import 'dart:math';

import 'package:core_network/core_network.dart';
import 'package:core_sync/core_sync.dart';

import '../domain/roster.dart';

class AttendanceRepository {
  AttendanceRepository(this._api, {OutboxWorker? outbox}) : _outbox = outbox;

  final ApiClient _api;
  final OutboxWorker? _outbox;

  Future<AttendanceRoster> fetchRoster({
    required String sectionId,
    required String day,
    String? periodId,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/attendance/roster',
      queryParameters: {
        'sectionId': sectionId,
        'day': day,
        if (periodId != null) 'periodId': periodId,
      },
    );
    return AttendanceRoster.fromJson(res.data ?? const {});
  }

  /// Online submit — used when outbox is unavailable.
  Future<Map<String, dynamic>> submit({
    required String sectionId,
    required String academicSessionId,
    required String day,
    required Map<String, MarkStatus> marks,
    Map<String, String?> remarks = const {},
    String? periodId,
    bool force = false,
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/attendance/registers',
      data: _body(
        sectionId: sectionId,
        academicSessionId: academicSessionId,
        day: day,
        marks: marks,
        remarks: remarks,
        periodId: periodId,
        force: force,
      ),
    );
    return res.data ?? const {};
  }

  /// Spec: write to outbox instantly — no spinner, no wait.
  Future<void> enqueueSubmit({
    required String sectionId,
    required String academicSessionId,
    required String day,
    required Map<String, MarkStatus> marks,
    Map<String, String?> remarks = const {},
    String? periodId,
    bool force = false,
  }) async {
    final body = _body(
      sectionId: sectionId,
      academicSessionId: academicSessionId,
      day: day,
      marks: marks,
      remarks: remarks,
      periodId: periodId,
      force: force,
    );
    final outbox = _outbox;
    if (outbox == null) {
      await submit(
        sectionId: sectionId,
        academicSessionId: academicSessionId,
        day: day,
        marks: marks,
        remarks: remarks,
        periodId: periodId,
        force: force,
      );
      return;
    }
    await outbox.enqueue(
      id: _mutationId(),
      method: 'POST',
      path: '/attendance/registers',
      body: body,
    );
    // Kick a flush without awaiting completion — UI already popped.
    unawaitedFlush(outbox);
  }

  Future<void> requestAmendment({
    required String registerId,
    required String reason,
  }) async {
    // Amend path when the teacher has attendance.student.amend; otherwise
    // the API returns 403 with a human-readable message.
    await _api.patch<Map<String, dynamic>>(
      '/attendance/registers/$registerId',
      data: {
        'reason': reason,
        'entries': <Map<String, dynamic>>[],
      },
    );
  }

  /// Prefer PATCH amend when we have a register id.
  Future<void> amend({
    required String registerId,
    required Map<String, MarkStatus> marks,
    required String reason,
    Map<String, String?> remarks = const {},
  }) async {
    final outbox = _outbox;
    final body = {
      'reason': reason,
      'entries': [
        for (final e in marks.entries)
          {
            'studentId': e.key,
            'status': e.value.apiValue,
            if (remarks[e.key] != null && remarks[e.key]!.isNotEmpty)
              'remarks': remarks[e.key],
          },
      ],
    };
    if (outbox == null) {
      await _api.patch<Map<String, dynamic>>(
        '/attendance/registers/$registerId',
        data: body,
      );
      return;
    }
    await outbox.enqueue(
      id: _mutationId(),
      method: 'PATCH',
      path: '/attendance/registers/$registerId',
      body: body,
    );
    unawaitedFlush(outbox);
  }

  Future<List<PendingSection>> fetchPending(String day) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/attendance/pending',
      queryParameters: {'day': day},
    );
    final data = res.data?['data'] as List<dynamic>? ?? const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(PendingSection.fromJson)
        .toList();
  }

  Map<String, dynamic> _body({
    required String sectionId,
    required String academicSessionId,
    required String day,
    required Map<String, MarkStatus> marks,
    required Map<String, String?> remarks,
    String? periodId,
    bool force = false,
  }) {
    return {
      'sectionId': sectionId,
      'academicSessionId': academicSessionId,
      'day': day,
      if (periodId != null) 'periodId': periodId,
      'mode': periodId == null ? 'daily' : 'period',
      if (force) 'force': true,
      'entries': [
        for (final e in marks.entries)
          {
            'studentId': e.key,
            'status': e.value.apiValue,
            if (remarks[e.key] != null && remarks[e.key]!.isNotEmpty)
              'remarks': remarks[e.key],
          },
      ],
    };
  }

  String _mutationId() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int b) => b.toRadixString(16).padLeft(2, '0');
    final h = bytes.map(hex).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
        '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  void unawaitedFlush(OutboxWorker outbox) {
    outbox.flush();
  }
}

class PendingSection {
  const PendingSection({
    required this.sectionId,
    required this.sectionLabel,
    this.minutesOverdue = 0,
  });

  final String sectionId;
  final String sectionLabel;
  final int minutesOverdue;

  factory PendingSection.fromJson(Map<String, dynamic> json) {
    return PendingSection(
      sectionId: json['sectionId'] as String? ?? '',
      sectionLabel: json['sectionLabel'] as String? ?? '',
      minutesOverdue: json['minutesOverdue'] as int? ?? 0,
    );
  }
}
