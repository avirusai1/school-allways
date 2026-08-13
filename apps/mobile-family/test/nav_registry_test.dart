import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_family/router/nav_registry.dart';

void main() {
  test('unknown nav manifest keys are skipped silently', () {
    final items = resolveNav(const [
      'family_home',
      'future_screen_v99',
      'fees',
    ]);
    expect(items.map((i) => i.route), [
      '/home',
      '/fees',
    ]);
  });

  test('manifestBlocksRoute when key absent', () {
    expect(manifestBlocksRoute('/fees', const ['family_home']), isTrue);
    expect(
      manifestBlocksRoute('/fees', const ['family_home', 'fees']),
      isFalse,
    );
    expect(manifestBlocksRoute('/login', const []), isFalse);
  });
}
