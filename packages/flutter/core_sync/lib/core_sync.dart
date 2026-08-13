/// Offline sync — Drift cache, outbox worker, click-to-sync controller.
library core_sync;

export 'src/tables.dart'
    show
        CachedStudentRow,
        SyncCursorRow,
        OutboxEntryRow,
        CachedStudents,
        SyncCursors,
        OutboxEntries;
export 'src/database.dart';
export 'src/outbox_worker.dart';
export 'src/sync_controller.dart';
