import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'tables.dart';

part 'database.g.dart';

@DriftDatabase(tables: [CachedStudents, SyncCursors, OutboxEntries])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  /// In-memory DB for unit tests (no Flutter plugins required).
  factory AppDatabase.memory() {
    return AppDatabase(NativeDatabase.memory());
  }

  /// File-backed DB. [file] lets tests reopen the same path to prove
  /// force-quit survival; production opens via [openDefault].
  factory AppDatabase.file(File file) {
    return AppDatabase(NativeDatabase.createInBackground(file));
  }

  /// Opens the on-device sqlite file under the app documents directory.
  static Future<AppDatabase> openDefault({
    String fileName = 'school_allways_sync.sqlite',
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, fileName));
    return AppDatabase.file(file);
  }

  @override
  int get schemaVersion => 1;

  Future<void> upsertStudent(CachedStudentRow row) {
    return into(cachedStudents).insertOnConflictUpdate(
      CachedStudentsCompanion.insert(
        id: row.id,
        tenantId: row.tenantId,
        payload: row.payload,
        rowVersion: row.rowVersion,
        cachedAt: row.cachedAt,
      ),
    );
  }

  Future<CachedStudentRow?> getStudent(String id) async {
    final row = await (select(cachedStudents)..where((t) => t.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return null;
    return CachedStudentRow(
      id: row.id,
      tenantId: row.tenantId,
      payload: row.payload,
      rowVersion: row.rowVersion,
      cachedAt: row.cachedAt,
    );
  }

  Future<void> deleteStudent(String id) {
    return (delete(cachedStudents)..where((t) => t.id.equals(id))).go();
  }

  Future<void> setCursor(SyncCursorRow row) {
    return into(syncCursors).insertOnConflictUpdate(
      SyncCursorsCompanion.insert(
        entity: row.entity,
        lastRowVersion: Value(row.lastRowVersion),
        lastSyncedAt: Value(row.lastSyncedAt),
      ),
    );
  }

  Future<SyncCursorRow?> getCursor(String entity) async {
    final row =
        await (select(syncCursors)..where((t) => t.entity.equals(entity)))
            .getSingleOrNull();
    if (row == null) return null;
    return SyncCursorRow(
      entity: row.entity,
      lastRowVersion: row.lastRowVersion,
      lastSyncedAt: row.lastSyncedAt,
    );
  }

  Future<void> enqueue(OutboxEntryRow entry) {
    return into(outboxEntries).insertOnConflictUpdate(
      OutboxEntriesCompanion.insert(
        id: entry.id,
        method: entry.method,
        path: entry.path,
        body: entry.body,
        attempts: Value(entry.attempts),
        nextAttemptAt: entry.nextAttemptAt,
        lastError: Value(entry.lastError),
        createdAt: entry.createdAt,
      ),
    );
  }

  Future<void> deleteOutbox(String id) {
    return (delete(outboxEntries)..where((t) => t.id.equals(id))).go();
  }

  Future<List<OutboxEntryRow>> dueOutbox({
    required DateTime now,
    int limit = 10,
  }) async {
    final rows = await (select(outboxEntries)
          ..where(
            (t) =>
                t.nextAttemptAt.isSmallerOrEqualValue(now) &
                t.attempts.isSmallerOrEqualValue(8),
          )
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)])
          ..limit(limit))
        .get();
    return [
      for (final row in rows)
        OutboxEntryRow(
          id: row.id,
          method: row.method,
          path: row.path,
          body: row.body,
          attempts: row.attempts,
          nextAttemptAt: row.nextAttemptAt,
          lastError: row.lastError,
          createdAt: row.createdAt,
        ),
    ];
  }

  Future<List<OutboxEntryRow>> parkedOutbox() async {
    final rows = await (select(outboxEntries)
          ..where((t) => t.attempts.isBiggerThanValue(8)))
        .get();
    return [
      for (final row in rows)
        OutboxEntryRow(
          id: row.id,
          method: row.method,
          path: row.path,
          body: row.body,
          attempts: row.attempts,
          nextAttemptAt: row.nextAttemptAt,
          lastError: row.lastError,
          createdAt: row.createdAt,
        ),
    ];
  }

  /// Pending (not parked) outbox rows — drives the app-bar sync chip.
  Future<int> pendingOutboxCount() async {
    final rows = await (select(outboxEntries)
          ..where((t) => t.attempts.isSmallerOrEqualValue(8)))
        .get();
    return rows.length;
  }

  Future<List<OutboxEntryRow>> allPendingOutbox() async {
    final rows = await (select(outboxEntries)
          ..where((t) => t.attempts.isSmallerOrEqualValue(8))
          ..orderBy([(t) => OrderingTerm.asc(t.createdAt)]))
        .get();
    return [
      for (final row in rows)
        OutboxEntryRow(
          id: row.id,
          method: row.method,
          path: row.path,
          body: row.body,
          attempts: row.attempts,
          nextAttemptAt: row.nextAttemptAt,
          lastError: row.lastError,
          createdAt: row.createdAt,
        ),
    ];
  }
}
