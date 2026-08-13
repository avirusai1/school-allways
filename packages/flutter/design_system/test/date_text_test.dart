import 'package:design_system/design_system.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('formatSawDate is 10 Aug 2026', () {
    expect(formatSawDate(DateTime(2026, 8, 10)), '10 Aug 2026');
  });

  test('parseIsoDateOnly', () {
    expect(parseIsoDateOnly('2026-08-10'), DateTime(2026, 8, 10));
    expect(parseIsoDateOnly('bad'), isNull);
  });
}
