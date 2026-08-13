import 'dart:async';

import 'package:core_network/core_network.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('concurrent refreshOnce shares a single in-flight call', () async {
    var calls = 0;
    final gate = Completer<void>();

    final coordinator = TokenRefreshCoordinator(() async {
      calls++;
      await gate.future;
    });

    final a = coordinator.refreshOnce();
    final b = coordinator.refreshOnce();
    final c = coordinator.refreshOnce();

    // Let microtasks schedule the shared future body.
    await Future<void>.delayed(Duration.zero);
    expect(calls, 1);
    expect(coordinator.isRefreshing, isTrue);

    gate.complete();
    await Future.wait([a, b, c]);
    expect(calls, 1);
    expect(coordinator.isRefreshing, isFalse);

    await coordinator.refreshOnce();
    expect(calls, 2);
  });
}
