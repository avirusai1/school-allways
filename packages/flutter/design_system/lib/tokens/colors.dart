/// Brand, neutral and semantic colour ramps.
///
/// Regenerated for the Material 3 revamp: every stop below is produced via
/// OKLCH (a perceptually-uniform colour space — the same reason M3's own HCT
/// space exists) from a single seed per hue, so hue and chroma taper are
/// consistent across the whole ramp. The five brand-defining anchors
/// (blue500, amber500, green500, red500, orange500, cyan500) are kept
/// EXACTLY as they were — nothing about the recognizable brand colours moved,
/// only the stops around them.
///
/// Feature widgets MUST NOT import this file. Read colours via
/// `Theme.of(context).colorScheme` / `AppThemeExtension`. Only the theme
/// factory and design-system components may reference [AppColors] directly.
library;

import 'package:flutter/material.dart';

abstract final class AppColors {
  // —— Brand (institutional blue) ——
  static const Color blue50 = Color(0xFFD4FAFF);
  static const Color blue100 = Color(0xFFC2EBFF);
  static const Color blue200 = Color(0xFFA1CEFF);
  static const Color blue300 = Color(0xFF76A9DF);
  static const Color blue400 = Color(0xFF4881BD);
  static const Color blue500 = Color(0xFF1B5E9C); // primary
  static const Color blue600 = Color(0xFF0F4E85);
  static const Color blue700 = Color(0xFF003D70);
  static const Color blue800 = Color(0xFF002E5C);
  static const Color blue900 = Color(0xFF001F49);

  // —— Accent (warm amber — rationed) ——
  static const Color amber50 = Color(0xFFFFEFBB);
  static const Color amber100 = Color(0xFFFFE2AB);
  static const Color amber200 = Color(0xFFFFCD91);
  static const Color amber300 = Color(0xFFF2BA7A);
  static const Color amber400 = Color(0xFFE6AD69);
  static const Color amber500 = Color(0xFFD98D1B); // accent CTA
  static const Color amber600 = Color(0xFFB47200);
  static const Color amber700 = Color(0xFF995200);

  // —— Neutral (cool grey, faint brand-blue tint per M3's neutral-palette convention) ——
  static const Color grey0 = Color(0xFFFDFFFF);
  static const Color grey25 = Color(0xFFF8FBFE); // app background
  static const Color grey50 = Color(0xFFF3F6F9);
  static const Color grey100 = Color(0xFFEBEEF1);
  static const Color grey200 = Color(0xFFDCE0E3); // borders
  static const Color grey300 = Color(0xFFC4C7CB);
  static const Color grey400 = Color(0xFF9DA1A5); // placeholder only
  static const Color grey500 = Color(0xFF767A7E); // tertiary text
  static const Color grey600 = Color(0xFF5D6165);
  static const Color grey700 = Color(0xFF474B4F); // secondary text
  static const Color grey800 = Color(0xFF2D3034);
  static const Color grey900 = Color(0xFF1D1F22); // primary text

  // —— Semantic ——
  static const Color green50 = Color(0xFFD5FFE2);
  static const Color green500 = Color(0xFF2E7D4F);
  static const Color green700 = Color(0xFF0D5C34);
  static const Color red50 = Color(0xFFFFD8CA);
  static const Color red500 = Color(0xFFC0392B);
  static const Color red700 = Color(0xFF98170D);
  static const Color orange50 = Color(0xFFFFEABA);
  static const Color orange500 = Color(0xFFC77700);
  static const Color orange700 = Color(0xFF994D00);
  static const Color cyan50 = Color(0xFFD0F8FF);
  static const Color cyan500 = Color(0xFF2A6FA8);
  static const Color cyan700 = Color(0xFF0A5082);

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
