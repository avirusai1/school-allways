import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_family/core/subscription_required_interceptor.dart';
import 'package:mobile_family/features/paywall/presentation/paywall_panel.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  test('interceptor maps HTTP 402 to SubscriptionRequiredException', () {
    late DioException forwarded;
    final interceptor = SubscriptionRequiredInterceptor();
    interceptor.onError(
      DioException(
        requestOptions: RequestOptions(path: '/family/fees'),
        response: Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: '/family/fees'),
          statusCode: 402,
          data: {
            'error': {
              'code': 'SUBSCRIPTION_REQUIRED',
              'message':
                  'This student is not subscribed for the current session.',
              'details': {'studentId': 'stu-aarav', 'amountPaise': 36500},
            },
          },
        ),
        type: DioExceptionType.badResponse,
      ),
      _CaptureErrorHandler((err) => forwarded = err),
    );

    expect(forwarded.error, isA<SubscriptionRequiredException>());
    final typed = forwarded.error! as SubscriptionRequiredException;
    expect(typed.studentId, 'stu-aarav');
    expect(typed.amountPaise, 36500);
  });

  testWidgets('mocked 402 routes to paywall instead of generic error',
      (tester) async {
    final error = DioException(
      requestOptions: RequestOptions(path: '/family/fees'),
      response: Response<Map<String, dynamic>>(
        requestOptions: RequestOptions(path: '/family/fees'),
        statusCode: 402,
        data: {
          'error': {
            'code': 'SUBSCRIPTION_REQUIRED',
            'message':
                'This student is not subscribed for the current session.',
            'details': {'studentId': 'stu-aarav', 'amountPaise': 36500},
          },
        },
      ),
      type: DioExceptionType.badResponse,
      error: const SubscriptionRequiredException(
        message: 'This student is not subscribed for the current session.',
        studentId: 'stu-aarav',
        amountPaise: 36500,
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.build(),
        home: Scaffold(
          body: PaywallOrError(
            error: error,
            studentName: 'Aarav',
            onRetry: () {},
            fallbackMessage: 'Could not load fees.',
          ),
        ),
      ),
    );

    expect(
      find.text('This section unlocks once Aarav is subscribed'),
      findsOneWidget,
    );
    expect(find.text('Could not load fees.'), findsNothing);
    expect(find.text('Subscribe — coming soon'), findsOneWidget);
  });

  testWidgets('non-402 errors still use ErrorState', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.build(),
        home: Scaffold(
          body: PaywallOrError(
            error: Exception('offline'),
            onRetry: () {},
            fallbackMessage: 'Could not load fees.',
          ),
        ),
      ),
    );

    expect(find.text('Could not load fees.'), findsOneWidget);
    expect(find.textContaining('unlocks once'), findsNothing);
  });
}

class _CaptureErrorHandler extends ErrorInterceptorHandler {
  _CaptureErrorHandler(this._onNext);

  final void Function(DioException err) _onNext;

  @override
  void next(DioException err) => _onNext(err);
}
