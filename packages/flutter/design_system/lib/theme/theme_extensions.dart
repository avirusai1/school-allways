import 'package:flutter/material.dart';

import '../tokens/colors.dart';

/// Semantic tokens Material's ThemeData doesn't model.
///
/// Feature widgets read THIS (via Theme.of), never [AppColors] directly.
@immutable
class AppThemeExtension extends ThemeExtension<AppThemeExtension> {
  const AppThemeExtension({
    required this.primary,
    required this.accent,
    required this.textPrimary,
    required this.textSecondary,
    required this.textTertiary,
    required this.textOnPrimary,
    required this.textOnAccent,
    required this.appBackground,
    required this.surface,
    required this.surfaceAlt,
    required this.border,
    required this.borderStrong,
    required this.placeholder,
    required this.disabledFill,
    required this.disabledText,
    required this.pressedOverlay,
    required this.success,
    required this.successBg,
    required this.successText,
    required this.danger,
    required this.dangerBg,
    required this.dangerText,
    required this.warning,
    required this.warningBg,
    required this.warningText,
    required this.info,
    required this.infoBg,
    required this.infoText,
    required this.attendancePresent,
    required this.attendanceAbsent,
    required this.attendanceLate,
    required this.attendanceHalfDay,
    required this.attendanceLeave,
    required this.attendanceHoliday,
    required this.focusRing,
  });

  /// Factory from the school primary (white-label). Amber/neutrals/semantics
  /// never change; only the blue ramp is overridden by [primaryColor].
  factory AppThemeExtension.fromPrimary(Color? primaryColor) {
    final primary = primaryColor ?? AppColors.blue500;
    return AppThemeExtension(
      primary: primary,
      accent: AppColors.amber500,
      textPrimary: AppColors.grey900,
      textSecondary: AppColors.grey700,
      textTertiary: AppColors.grey500,
      textOnPrimary: AppColors.grey0,
      textOnAccent: AppColors.grey900,
      appBackground: AppColors.grey25,
      surface: AppColors.grey0,
      surfaceAlt: AppColors.grey50,
      border: AppColors.grey200,
      borderStrong: AppColors.grey300,
      placeholder: AppColors.grey400,
      disabledFill: AppColors.grey100,
      disabledText: AppColors.grey400,
      pressedOverlay: AppColors.grey50,
      success: AppColors.green500,
      successBg: AppColors.green50,
      successText: AppColors.green700,
      danger: AppColors.red500,
      dangerBg: AppColors.red50,
      dangerText: AppColors.red700,
      warning: AppColors.orange500,
      warningBg: AppColors.orange50,
      warningText: AppColors.orange700,
      info: AppColors.cyan500,
      infoBg: AppColors.cyan50,
      infoText: AppColors.cyan700,
      attendancePresent: AppColors.attendancePresent,
      attendanceAbsent: AppColors.attendanceAbsent,
      attendanceLate: AppColors.attendanceLate,
      attendanceHalfDay: AppColors.attendanceHalfDay,
      attendanceLeave: AppColors.attendanceLeave,
      attendanceHoliday: AppColors.attendanceHoliday,
      focusRing: primary,
    );
  }

  final Color primary;
  final Color accent;
  final Color textPrimary;
  final Color textSecondary;
  final Color textTertiary;
  final Color textOnPrimary;
  final Color textOnAccent;
  final Color appBackground;
  final Color surface;
  final Color surfaceAlt;
  final Color border;
  final Color borderStrong;
  final Color placeholder;
  final Color disabledFill;
  final Color disabledText;
  final Color pressedOverlay;
  final Color success;
  final Color successBg;
  final Color successText;
  final Color danger;
  final Color dangerBg;
  final Color dangerText;
  final Color warning;
  final Color warningBg;
  final Color warningText;
  final Color info;
  final Color infoBg;
  final Color infoText;
  final Color attendancePresent;
  final Color attendanceAbsent;
  final Color attendanceLate;
  final Color attendanceHalfDay;
  final Color attendanceLeave;
  final Color attendanceHoliday;
  final Color focusRing;

  static AppThemeExtension of(BuildContext context) {
    return Theme.of(context).extension<AppThemeExtension>()!;
  }

  @override
  AppThemeExtension copyWith({
    Color? primary,
    Color? accent,
    Color? textPrimary,
    Color? textSecondary,
    Color? textTertiary,
    Color? textOnPrimary,
    Color? textOnAccent,
    Color? appBackground,
    Color? surface,
    Color? surfaceAlt,
    Color? border,
    Color? borderStrong,
    Color? placeholder,
    Color? disabledFill,
    Color? disabledText,
    Color? pressedOverlay,
    Color? success,
    Color? successBg,
    Color? successText,
    Color? danger,
    Color? dangerBg,
    Color? dangerText,
    Color? warning,
    Color? warningBg,
    Color? warningText,
    Color? info,
    Color? infoBg,
    Color? infoText,
    Color? attendancePresent,
    Color? attendanceAbsent,
    Color? attendanceLate,
    Color? attendanceHalfDay,
    Color? attendanceLeave,
    Color? attendanceHoliday,
    Color? focusRing,
  }) {
    return AppThemeExtension(
      primary: primary ?? this.primary,
      accent: accent ?? this.accent,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textTertiary: textTertiary ?? this.textTertiary,
      textOnPrimary: textOnPrimary ?? this.textOnPrimary,
      textOnAccent: textOnAccent ?? this.textOnAccent,
      appBackground: appBackground ?? this.appBackground,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      border: border ?? this.border,
      borderStrong: borderStrong ?? this.borderStrong,
      placeholder: placeholder ?? this.placeholder,
      disabledFill: disabledFill ?? this.disabledFill,
      disabledText: disabledText ?? this.disabledText,
      pressedOverlay: pressedOverlay ?? this.pressedOverlay,
      success: success ?? this.success,
      successBg: successBg ?? this.successBg,
      successText: successText ?? this.successText,
      danger: danger ?? this.danger,
      dangerBg: dangerBg ?? this.dangerBg,
      dangerText: dangerText ?? this.dangerText,
      warning: warning ?? this.warning,
      warningBg: warningBg ?? this.warningBg,
      warningText: warningText ?? this.warningText,
      info: info ?? this.info,
      infoBg: infoBg ?? this.infoBg,
      infoText: infoText ?? this.infoText,
      attendancePresent: attendancePresent ?? this.attendancePresent,
      attendanceAbsent: attendanceAbsent ?? this.attendanceAbsent,
      attendanceLate: attendanceLate ?? this.attendanceLate,
      attendanceHalfDay: attendanceHalfDay ?? this.attendanceHalfDay,
      attendanceLeave: attendanceLeave ?? this.attendanceLeave,
      attendanceHoliday: attendanceHoliday ?? this.attendanceHoliday,
      focusRing: focusRing ?? this.focusRing,
    );
  }

  @override
  AppThemeExtension lerp(ThemeExtension<AppThemeExtension>? other, double t) {
    if (other is! AppThemeExtension) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppThemeExtension(
      primary: l(primary, other.primary),
      accent: l(accent, other.accent),
      textPrimary: l(textPrimary, other.textPrimary),
      textSecondary: l(textSecondary, other.textSecondary),
      textTertiary: l(textTertiary, other.textTertiary),
      textOnPrimary: l(textOnPrimary, other.textOnPrimary),
      textOnAccent: l(textOnAccent, other.textOnAccent),
      appBackground: l(appBackground, other.appBackground),
      surface: l(surface, other.surface),
      surfaceAlt: l(surfaceAlt, other.surfaceAlt),
      border: l(border, other.border),
      borderStrong: l(borderStrong, other.borderStrong),
      placeholder: l(placeholder, other.placeholder),
      disabledFill: l(disabledFill, other.disabledFill),
      disabledText: l(disabledText, other.disabledText),
      pressedOverlay: l(pressedOverlay, other.pressedOverlay),
      success: l(success, other.success),
      successBg: l(successBg, other.successBg),
      successText: l(successText, other.successText),
      danger: l(danger, other.danger),
      dangerBg: l(dangerBg, other.dangerBg),
      dangerText: l(dangerText, other.dangerText),
      warning: l(warning, other.warning),
      warningBg: l(warningBg, other.warningBg),
      warningText: l(warningText, other.warningText),
      info: l(info, other.info),
      infoBg: l(infoBg, other.infoBg),
      infoText: l(infoText, other.infoText),
      attendancePresent: l(attendancePresent, other.attendancePresent),
      attendanceAbsent: l(attendanceAbsent, other.attendanceAbsent),
      attendanceLate: l(attendanceLate, other.attendanceLate),
      attendanceHalfDay: l(attendanceHalfDay, other.attendanceHalfDay),
      attendanceLeave: l(attendanceLeave, other.attendanceLeave),
      attendanceHoliday: l(attendanceHoliday, other.attendanceHoliday),
      focusRing: l(focusRing, other.focusRing),
    );
  }
}

/// Density profiles from build/11 §11 — choose per screen, never mix.
enum AppDensity { comfortable, compact }

@immutable
class AppDensityExtension extends ThemeExtension<AppDensityExtension> {
  const AppDensityExtension({required this.density});

  final AppDensity density;

  double get rowHeight => density == AppDensity.compact ? 44 : 64;
  double get bodySize => density == AppDensity.compact ? 14 : 15;
  double get padding => density == AppDensity.compact ? 12 : 16;

  static AppDensityExtension of(BuildContext context) {
    return Theme.of(context).extension<AppDensityExtension>() ??
        const AppDensityExtension(density: AppDensity.comfortable);
  }

  @override
  AppDensityExtension copyWith({AppDensity? density}) {
    return AppDensityExtension(density: density ?? this.density);
  }

  @override
  AppDensityExtension lerp(
    ThemeExtension<AppDensityExtension>? other,
    double t,
  ) {
    if (other is! AppDensityExtension) return this;
    return t < 0.5 ? this : other;
  }
}

/// Convenience accessors used by design_system components.
extension AppThemeContext on BuildContext {
  AppThemeExtension get tokens => AppThemeExtension.of(this);
  AppDensityExtension get density => AppDensityExtension.of(this);
  ThemeData get theme => Theme.of(this);
}
