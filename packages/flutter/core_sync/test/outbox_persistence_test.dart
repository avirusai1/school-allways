import 'dart:io';

import 'package:core_sync/core_sync.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:core_network/core_network.dart';

void main() {
  test('outbox survives close/reopen and flushes exactly once', () async {
    final dir = await Directory.systemTemp.createTemp('saw_outbox_');
    final file = File('${dir.path}/sync.sqlite');
    addTearDown(() async {
      await dir.delete(recursive: true);
    });

    final id = 'mut-force-quit-1';
    final now = DateTime.now();

    final db1 = AppDatabase.file(file);
    await db1.enqueue(
      OutboxEntryRow(
        id: id,
        method: 'POST',
        path: '/attendance/mark',
        body: '{"studentId":"s1","status":"present"}',
        nextAttemptAt: now,
        createdAt: now,
      ),
    );
    await db1.close();

    // Simulate force-quit + reopen on a fresh process.
    final db2 = AppDatabase.file(file);
    final due = await db2.dueOutbox(now: DateTime.now().add(const Duration(seconds: 1)));
    expect(due.map((e) => e.id), [id]);

    var posts = 0;
    final dio = Dio()
      ..httpClientAdapter = _CountingAdapter(() {
        posts++;
        return ResponseBody.fromString('{}', 200, headers: {
          Headers.contentTypeHeader: ['application/json'],
        });
      });

    final api = ApiClient(
      dio: dio,
      tokenProvider: () async => 'tok',
      refreshTokens: () async {},
    );
    // Absolute path so Dio hits the adapter regardless of baseUrl.
    dio.options.baseUrl = 'https://example.test';

    final worker = OutboxWorker(db: db2, api: api);
    await worker.flush();
    expect(posts, 1);

    final remaining = await db2.dueOutbox(now: DateTime.now());
    expect(remaining, isEmpty);

    // Second flush must not re-send.
    await worker.flush();
    expect(posts, 1);

    await db2.close();
    worker.dispose();
  });
}

class _CountingAdapter implements HttpClientAdapter {
  _CountingAdapter(this._onFetch);

  final ResponseBody Function() _onFetch;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    return _onFetch();
  }
}
