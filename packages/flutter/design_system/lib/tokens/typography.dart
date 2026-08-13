import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors.dart';

/// Typography tokens. Inter for Latin, Noto Sans Devanagari for Hindi.
/// Body is **15px always** — never 14 or 16.
abstract final class AppTypography {
  static TextStyle _inter({
    required double size,
    required double height,
    required FontWeight weight,
    double letterSpacing = 0,
    Color? color,
    FontFeature? feature,
  }) {
    return GoogleFonts.inter(
      fontSize: size,
      height: height / size,
      fontWeight: weight,
      letterSpacing: letterSpacing,
      color: color,
      fontFeatures: feature == null ? null : [feature],
    );
  }

  static TextStyle display({Color? color}) => _inter(
        size: 28,
        height: 34,
        weight: FontWeight.w700,
        letterSpacing: -0.4,
        color: color ?? AppColors.grey900,
      );

  static TextStyle h1({Color? color}) => _inter(
        size: 22,
        height: 28,
        weight: FontWeight.w600,
        letterSpacing: -0.3,
        color: color ?? AppColors.grey900,
      );

  static TextStyle h2({Color? color}) => _inter(
        size: 18,
        height: 24,
        weight: FontWeight.w600,
        letterSpacing: -0.2,
        color: color ?? AppColors.grey900,
      );

  static TextStyle h3({Color? color}) => _inter(
        size: 16,
        height: 22,
        weight: FontWeight.w600,
        letterSpacing: -0.1,
        color: color ?? AppColors.grey900,
      );

  static TextStyle body({Color? color}) => _inter(
        size: 15,
        height: 22,
        weight: FontWeight.w400,
        color: color ?? AppColors.grey900,
      );

  static TextStyle bodyMedium({Color? color}) => _inter(
        size: 15,
        height: 22,
        weight: FontWeight.w500,
        color: color ?? AppColors.grey900,
      );

  static TextStyle bodySmall({Color? color}) => _inter(
        size: 13,
        height: 18,
        weight: FontWeight.w400,
        color: color ?? AppColors.grey500,
      );

  static TextStyle label({Color? color}) => _inter(
        size: 13,
        height: 16,
        weight: FontWeight.w500,
        letterSpacing: 0.1,
        color: color ?? AppColors.grey700,
      );

  static TextStyle caption({Color? color}) => _inter(
        size: 12,
        height: 16,
        weight: FontWeight.w500,
        letterSpacing: 0.2,
        color: color ?? AppColors.grey500,
      );

  static TextStyle overline({Color? color}) => _inter(
        size: 11,
        height: 14,
        weight: FontWeight.w600,
        letterSpacing: 0.8,
        color: color ?? AppColors.grey700,
      );

  /// Tabular figures — marks, money, roll numbers.
  static TextStyle numeric({Color? color}) => _inter(
        size: 15,
        height: 22,
        weight: FontWeight.w500,
        color: color ?? AppColors.grey900,
        feature: const FontFeature.tabularFigures(),
      );

  static TextStyle numericLarge({Color? color}) => _inter(
        size: 24,
        height: 30,
        weight: FontWeight.w600,
        letterSpacing: -0.2,
        color: color ?? AppColors.grey900,
        feature: const FontFeature.tabularFigures(),
      );

  /// Compact density body (attendance marking) — 14px only in compact profile.
  static TextStyle compactBody({Color? color}) => _inter(
        size: 14,
        height: 20,
        weight: FontWeight.w400,
        color: color ?? AppColors.grey900,
      );

  static TextTheme textTheme({Color? primary}) {
    final p = primary ?? AppColors.grey900;
    return TextTheme(
      displayLarge: display(color: p),
      headlineLarge: h1(color: p),
      headlineMedium: h2(color: p),
      headlineSmall: h3(color: p),
      bodyLarge: body(color: p),
      bodyMedium: bodyMedium(color: p),
      bodySmall: bodySmall(),
      labelLarge: label(),
      labelMedium: caption(),
      labelSmall: overline(),
    );
  }

  /// Load Devanagari so Hindi layouts don't reflow on first paint.
  static Future<void> preloadFonts() async {
    GoogleFonts.pendingFonts([
      GoogleFonts.inter(),
      GoogleFonts.notoSansDevanagari(),
    ]);
  }
}
