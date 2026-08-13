/// Brand, neutral and semantic colour ramps.
///
/// Feature widgets MUST NOT import this file. Read colours via
/// `Theme.of(context).colorScheme` / `AppThemeExtension`. Only the theme
/// factory and design-system components may reference [AppColors] directly.
library;

import 'package:flutter/material.dart';

abstract final class AppColors {
  // —— Brand (institutional blue) ——
  static const Color blue50 = Color(0xFFF1F6FB);
  static const Color blue100 = Color(0xFFDCE8F4);
  static const Color blue200 = Color(0xFFB4CDE6);
  static const Color blue300 = Color(0xFF7FA9D1);
  static const Color blue400 = Color(0xFF4A82B8);
  static const Color blue500 = Color(0xFF1B5E9C); // primary
  static const Color blue600 = Color(0xFF164E82);
  static const Color blue700 = Color(0xFF123E68);
  static const Color blue800 = Color(0xFF0E2F4F);
  static const Color blue900 = Color(0xFF0A2138);

  // —— Accent (warm amber — rationed) ——
  static const Color amber50 = Color(0xFFFEF7EC);
  static const Color amber100 = Color(0xFFFBE9CC);
  static const Color amber200 = Color(0xFFF6D293);
  static const Color amber300 = Color(0xFFF2BC5F);
  static const Color amber400 = Color(0xFFEFAA3C);
  static const Color amber500 = Color(0xFFD98D1B); // accent CTA
  static const Color amber600 = Color(0xFFB57113);
  static const Color amber700 = Color(0xFF8F570E);

  // —— Neutral (cool grey) ——
  static const Color grey0 = Color(0xFFFFFFFF);
  static const Color grey25 = Color(0xFFFAFBFC); // app background
  static const Color grey50 = Color(0xFFF4F6F8);
  static const Color grey100 = Color(0xFFEAEEF2);
  static const Color grey200 = Color(0xFFDAE0E6); // borders
  static const Color grey300 = Color(0xFFBFC8D2);
  static const Color grey400 = Color(0xFF94A2B1); // placeholder only
  static const Color grey500 = Color(0xFF6B7B8C); // tertiary text
  static const Color grey600 = Color(0xFF526273);
  static const Color grey700 = Color(0xFF3D4C5C); // secondary text
  static const Color grey800 = Color(0xFF26313D);
  static const Color grey900 = Color(0xFF16202B); // primary text

  // —— Semantic ——
  static const Color green50 = Color(0xFFEDF7F1);
  static const Color green500 = Color(0xFF2E7D4F);
  static const Color green700 = Color(0xFF1F5A38);

  static const Color red50 = Color(0xFFFCEEEC);
  static const Color red500 = Color(0xFFC0392B);
  static const Color red700 = Color(0xFF8E2A20);

  static const Color orange50 = Color(0xFFFDF3E7);
  static const Color orange500 = Color(0xFFC77700);
  static const Color orange700 = Color(0xFF954F00);

  static const Color cyan50 = Color(0xFFEBF4FA);
  static const Color cyan500 = Color(0xFF2A6FA8);
  static const Color cyan700 = Color(0xFF1D5079);

  // —— Attendance (fixed — never re-themed) ——
  static const Color attendancePresent = green500;
  static const Color attendanceAbsent = red500;
  static const Color attendanceLate = orange500;
  static const Color attendanceHalfDay = cyan500;
  static const Color attendanceLeave = grey500;
  static const Color attendanceHoliday = grey300;

  /// Darken [color] by ~8% for pressed states.
  static Color pressed(Color color) {
    final hsl = HSLColor.fromColor(color);
    return hsl.withLightness((hsl.lightness - 0.08).clamp(0.0, 1.0)).toColor();
  }

  /// Rebuild the blue ramp around a school white-label primary.
  static Color primaryOr(Color? schoolPrimary) => schoolPrimary ?? blue500;
}
