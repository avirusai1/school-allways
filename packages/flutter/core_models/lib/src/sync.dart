class SyncStatusDto {
  const SyncStatusDto({
    required this.pendingCount,
    this.lastSyncedAt,
  });

  final int pendingCount;
  final DateTime? lastSyncedAt;

  factory SyncStatusDto.fromJson(Map<String, dynamic> json) {
    return SyncStatusDto(
      pendingCount: json['pendingCount'] as int,
      lastSyncedAt: json['lastSyncedAt'] != null
          ? DateTime.parse(json['lastSyncedAt'] as String)
          : null,
    );
  }
}

class SyncPullPage {
  const SyncPullPage({
    required this.changes,
    required this.hasMore,
    required this.cursor,
  });

  final List<SyncEntityChange> changes;
  final bool hasMore;
  final int cursor;

  factory SyncPullPage.fromJson(Map<String, dynamic> json) {
    return SyncPullPage(
      changes: (json['changes'] as List<dynamic>? ?? const [])
          .map((e) => SyncEntityChange.fromJson(e as Map<String, dynamic>))
          .toList(),
      hasMore: json['hasMore'] as bool? ?? false,
      cursor: json['cursor'] as int? ?? 0,
    );
  }
}

class SyncEntityChange {
  const SyncEntityChange({
    required this.entity,
    required this.id,
    required this.rowVersion,
    required this.payload,
    this.deleted = false,
  });

  final String entity;
  final String id;
  final int rowVersion;
  final Map<String, dynamic> payload;
  final bool deleted;

  factory SyncEntityChange.fromJson(Map<String, dynamic> json) {
    return SyncEntityChange(
      entity: json['entity'] as String,
      id: json['id'] as String,
      rowVersion: json['rowVersion'] as int,
      payload: Map<String, dynamic>.from(json['payload'] as Map? ?? const {}),
      deleted: json['deleted'] as bool? ?? false,
    );
  }
}
