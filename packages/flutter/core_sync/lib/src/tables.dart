import 'package:drift/drift.dart';

/// Drift schema from build/12 §4 — mirrors server entities + sync columns.

class CachedStudents extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get payload => text()();
  IntColumn get rowVersion => integer()();
  DateTimeColumn get cachedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

class SyncCursors extends Table {
  TextColumn get entity => text()();
  IntColumn get lastRowVersion => integer().withDefault(const Constant(0))();
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {entity};
}

class OutboxEntries extends Table {
  TextColumn get id => text()();
  TextColumn get method => text()();
  TextColumn get path => text()();
  TextColumn get body => text()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime()();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Domain row used by workers/tests (maps 1:1 from Drift data classes).
class OutboxEntryRow {
  const OutboxEntryRow({
    required this.id,
    required this.method,
    required this.path,
    required this.body,
    this.attempts = 0,
    required this.nextAttemptAt,
    this.lastError,
    required this.createdAt,
  });

  /// == X-Client-Mutation-Id
  final String id;
  final String method;
  final String path;
  final String body;
  final int attempts;
  final DateTime nextAttemptAt;
  final String? lastError;
  final DateTime createdAt;

  OutboxEntryRow copyWith({
    int? attempts,
    DateTime? nextAttemptAt,
    String? lastError,
  }) {
    return OutboxEntryRow(
      id: id,
      method: method,
      path: path,
      body: body,
      attempts: attempts ?? this.attempts,
      nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,
      lastError: lastError ?? this.lastError,
      createdAt: createdAt,
    );
  }
}

class CachedStudentRow {
  const CachedStudentRow({
    required this.id,
    required this.tenantId,
    required this.payload,
    required this.rowVersion,
    required this.cachedAt,
  });

  final String id;
  final String tenantId;
  final String payload;
  final int rowVersion;
  final DateTime cachedAt;
}

class SyncCursorRow {
  const SyncCursorRow({
    required this.entity,
    this.lastRowVersion = 0,
    this.lastSyncedAt,
  });

  final String entity;
  final int lastRowVersion;
  final DateTime? lastSyncedAt;
}
