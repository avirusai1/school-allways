import 'package:design_system/design_system.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Indian money grouping from integer paise', () {
    expect(formatIndianMoney(125050), '₹1,250.50');
    expect(formatIndianMoney(125000000), '₹12,50,000.00');
    expect(formatIndianMoney(100), '₹1.00');
    expect(formatIndianMoney(-50050), '-₹500.50');
  });

  test('Indian number grouping', () {
    expect(formatIndianNumber(1250000), '12,50,000');
    expect(formatIndianNumber(999), '999');
  });
}
