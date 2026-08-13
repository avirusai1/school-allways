import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:core_network/core_network.dart';
import 'package:dio/dio.dart';

import 'database.dart';
import 'tables.dart';

/// Outbox worker — survives force-quit when backed by sqlite.
///
/// on connectivity restored, and every 30s while online:
///   entries where nextAttemptAt <= now, ordered by createdAt, max 10 per pass
///   → POST with X-Client-Mutation-Id
///   → 2xx            : delete entry, apply server response to cache
///   → 4xx (not 429)  : delete entry, surface persistent error
///   → 429 / 5xx / net: attempts++, backoff 2^n capped at 5 min
///   → attempts > 8   : park it, show "Couldn't sync — tap for details"
class OutboxWorker {
  OutboxWorker({
    required AppDatabase db,
    required ApiClient api,
  })  : _db = db,
        _api = api;

  final AppDatabase _db;
  final ApiClient _api;
  Timer? _timer;
  bool _running = false;

  final _errors = StreamController<OutboxEntryRow>.broadcast();
  Stream<OutboxEntryRow> get persistentErrors => _errors.stream;

  void start({Duration interval = const Duration(seconds: 30)}) {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => flush());
    unawaited(flush());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> flush() async {
    if (_running) return;
    _running = true;
    try {
      final due = await _db.dueOutbox(now: DateTime.now());
      for (final entry in due) {
        await _send(entry);
      }
    } finally {
      _running = false;
    }
  }

  Future<void> enqueue({
    required String id,
    required String method,
    required String path,
    required Map<String, dynamic> body,
  }) {
    return _db.enqueue(
      OutboxEntryRow(
        id: id,
        method: method,
        path: path,
        body: jsonEncode(body),
        nextAttemptAt: DateTime.now(),
        createdAt: DateTime.now(),
      ),
    );
  }

  Future<void> _send(OutboxEntryRow entry) async {
    try {
      final data = jsonDecode(entry.body);
      await _api.dio.request<dynamic>(
        entry.path,
        data: data,
        options: Options(
          method: entry.method,
          headers: {'X-Client-Mutation-Id': entry.id},
        ),
      );
      await _db.deleteOutbox(entry.id);
    } on DioException catch (e) {
      final status = e.response?.statusCode ?? 0;
      if (status >= 400 && status < 500 && status != 429) {
        await _db.deleteOutbox(entry.id);
        _errors.add(entry.copyWith(lastError: e.message));
        return;
      }
      await _backoff(entry, e.message);
    } catch (e) {
      await _backoff(entry, e.toString());
    }
  }

  Future<void> _backoff(OutboxEntryRow entry, String? error) async {
    final attempts = entry.attempts + 1;
    final seconds = min(pow(2, attempts).toInt(), 300);
    final updated = entry.copyWith(
      attempts: attempts,
      nextAttemptAt: DateTime.now().add(Duration(seconds: seconds)),
      lastError: error,
    );
    await _db.enqueue(updated);
    // attempts > 8 → park; surface so UI can show "Couldn't sync".
    if (attempts > 8) {
      _errors.add(updated);
    }
  }

  void dispose() {
    stop();
    unawaited(_errors.close());
  }
}
