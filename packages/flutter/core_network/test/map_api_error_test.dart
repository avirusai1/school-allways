import 'package:core_network/core_network.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps nested 402 SUBSCRIPTION_REQUIRED envelope', () {
    final mapped = mapApiError(
      statusCode: 402,
      body: {
        'error': {
          'code': 'SUBSCRIPTION_REQUIRED',
          'message': 'This student is not subscribed for the current session.',
          'details': {'studentId': 'stu-1', 'amountPaise': 36500},
        },
      },
    );

    expect(mapped, isA<SubscriptionRequiredException>());
    final typed = mapped as SubscriptionRequiredException;
    expect(typed.studentId, 'stu-1');
    expect(typed.amountPaise, 36500);
    expect(typed.code, 'SUBSCRIPTION_REQUIRED');
  });

  test('unwraps nested error before reading VALIDATION_FAILED', () {
    final mapped = mapApiError(
      statusCode: 400,
      body: {
        'error': {
          'code': 'VALIDATION_FAILED',
          'message': 'Choose a photo to upload.',
        },
      },
    );
    expect(mapped, isA<ValidationException>());
    expect(mapped.message, 'Choose a photo to upload.');
  });
}
