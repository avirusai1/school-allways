// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appTitle => 'स्कूल ऑल वेज़ एडमिन';

  @override
  String get home => 'होम';

  @override
  String get more => 'और';

  @override
  String get signIn => 'साइन इन';

  @override
  String get takeAttendance => 'उपस्थिति';

  @override
  String get marksEntry => 'अंक';

  @override
  String get offlineHint =>
      'आप ऑफ़लाइन लग रहे हैं। कनेक्ट होने पर बदलाव सिंक होंगे।';

  @override
  String studentsMarkedPresent(int count) {
    return '$count विद्यार्थी उपस्थित चिह्नित';
  }
}
