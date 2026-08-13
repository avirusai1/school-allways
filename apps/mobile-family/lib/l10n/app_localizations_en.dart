// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'School All Ways';

  @override
  String get home => 'Home';

  @override
  String get more => 'More';

  @override
  String get signIn => 'Sign in';

  @override
  String get offlineHint =>
      'You appear to be offline. Changes will sync when you reconnect.';

  @override
  String studentsMarkedPresent(int count) {
    return '$count students marked present';
  }
}
