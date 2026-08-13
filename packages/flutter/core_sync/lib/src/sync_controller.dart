import 'dart:convert';

import 'package:core_models/core_models.dart';
import 'package:core_network/core_network.dart';
import 'package:flutter/foundation.dart';

import 'database.dart';
import 'tables.dart';

/// Implements docs/04 click-to-sync.
///
/// - [checkStatus]: GET /sync/status, updates pendingCount. Called on resume
///   and on a silent FCM data message. Costs ~200 bytes.
/// - [pull]: GET /sync/pull, pages until hasMore is false. USER-TRIGGERED.
/// - Payloads > 50 KB are decoded in an isolate via [compute].
class SyncController {
  SyncController({
    required AppDatabase db,
    required ApiClient api,
  })  : _db = db,
        _api = api;

  final AppDatabase _db;
  final ApiClient _api;

  int pendingCount = 0;
  DateTime? lastSyncedAt;

  Future<SyncStatusDto> checkStatus() async {
    final res = await _api.get<Map<String, dynamic>>('/sync/status');
    final status = SyncStatusDto.fromJson(res.data ?? const {});
    pendingCount = status.pendingCount;
    lastSyncedAt = status.lastSyncedAt;
    return status;
  }

  /// User-triggered pull. Pages until [SyncPullPage.hasMore] is false.
  Future<void> pull() async {
    var cursor = (await _db.getCursor('global'))?.lastRowVersion ?? 0;
    var hasMore = true;

    while (hasMore) {
      final res = await _api.get<Map<String, dynamic>>(
        '/sync/pull',
        queryParameters: {'cursor': cursor},
      );
      final raw = res.data ?? const <String, dynamic>{};
      final page = await _decodePage(raw);
      for (final change in page.changes) {
        await _applyChange(change);
      }
      cursor = page.cursor;
      hasMore = page.hasMore;
      await _db.setCursor(
        SyncCursorRow(
          entity: 'global',
          lastRowVersion: cursor,
          lastSyncedAt: DateTime.now(),
        ),
      );
    }
    lastSyncedAt = DateTime.now();
    pendingCount = 0;
  }

  Future<SyncPullPage> _decodePage(Map<String, dynamic> raw) async {
    final encoded = jsonEncode(raw);
    // Payloads > 50 KB decode off the UI isolate — stutter on a 2 GB phone.
    if (encoded.length > 50 * 1024) {
      return compute(_parsePullPage, encoded);
    }
    return SyncPullPage.fromJson(raw);
  }

  Future<void> _applyChange(SyncEntityChange change) async {
    if (change.entity == 'students') {
      if (change.deleted) {
        await _db.deleteStudent(change.id);
        return;
      }
      await _db.upsertStudent(
        CachedStudentRow(
          id: change.id,
          tenantId: change.payload['tenantId'] as String? ?? '',
          payload: jsonEncode(change.payload),
          rowVersion: change.rowVersion,
          cachedAt: DateTime.now(),
        ),
      );
    }
  }
}

SyncPullPage _parsePullPage(String encoded) {
  final map = jsonDecode(encoded) as Map<String, dynamic>;
  return SyncPullPage.fromJson(map);
}
