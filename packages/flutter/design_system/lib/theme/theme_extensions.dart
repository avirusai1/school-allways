import 'package:flutter/material.dart';

import '../tokens/colors.dart';

/// Semantic tokens Material's ThemeData doesn't model.
///
/// Feature widgets read THIS (via Theme.of), never [AppColors] directly.
///
/// M3 fields (added for the Material 3 revamp): surface/text/outline roles are
/// now sourced from a real HCT [ColorScheme] built by [AppTheme.build] via
/// `ColorScheme.fromSeed` — Flutter's own Material Color Utilities engine —
/// rather than the static grey ramp. Semantic colours (success/danger/warning/
/// info) and attendance colours stay on the fixed [AppColors] palette; they are
/// deliberately never re-themed regardless of a school's white-label primary.
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
    // —— M3 additions ——
    required this.onPrimary,
    required this.primaryContainer,
    required this.onPrimaryContainer,
    required this.onAccent,
    required this.accentContainer,
    required this.onAccentContainer,
    required this.tertiary,
    required this.onTertiary,
    required this.tertiaryContainer,
    required this.onTertiaryContainer,
    required this.surfaceContainerLowest,
    required this.surfaceContainerLow,
    required this.surfaceContainer,
    required this.surfaceContainerHigh,
    required this.surfaceContainerHighest,
    required this.outline,
    required this.outlineVariant,
    required this.stateLayerHover,
    required this.stateLayerFocus,
    required this.stateLayerPress,
  });

  /// Factory from the school primary (white-label). Amber/neutrals/semantics
  /// never change; only the blue ramp is overridden by [primaryColor].
  ///
  /// [scheme] is the real M3 ColorScheme built by [AppTheme.build] (HCT via
  /// `ColorScheme.fromSeed`) — passed in rather than rebuilt here so the two
  /// stay in lockstep with exactly one seed computation.
  factory AppThemeExtension.fromScheme(
    ColorScheme scheme,
    ColorScheme accentScheme,
    ColorScheme tertiaryScheme,
  ) {
    final primary = scheme.primary;
    return AppThemeExtension(
      primary: primary,
      accent: accentScheme.primary,
      textPrimary: scheme.onSurface,
      textSecondary: scheme.onSurfaceVariant,
      textTertiary: AppColors.grey500,
      textOnPrimary: scheme.onPrimary,
      textOnAccent: accentScheme.onPrimary,
      appBackground: scheme.surfaceContainerLowest,
      surface: scheme.surface,
      surfaceAlt: scheme.surfaceContainerLow,
      border: scheme.outlineVariant,
      borderStrong: scheme.outline,
      placeholder: AppColors.grey400,
      disabledFill: scheme.surfaceContainerHighest,
      disabledText: AppColors.grey400,
      pressedOverlay: scheme.surfaceContainer,
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
      onPrimary: scheme.onPrimary,
      primaryContainer: scheme.primaryContainer,
      onPrimaryContainer: scheme.onPrimaryContainer,
      onAccent: accentScheme.onPrimary,
      accentContainer: accentScheme.primaryContainer,
      onAccentContainer: accentScheme.onPrimaryContainer,
      tertiary: tertiaryScheme.primary,
      onTertiary: tertiaryScheme.onPrimary,
      tertiaryContainer: tertiaryScheme.primaryContainer,
      onTertiaryContainer: tertiaryScheme.onPrimaryContainer,
      surfaceContainerLowest: scheme.surfaceContainerLowest,
      surfaceContainerLow: scheme.surfaceContainerLow,
      surfaceContainer: scheme.surfaceContainer,
      surfaceContainerHigh: scheme.surfaceContainerHigh,
      surfaceContainerHighest: scheme.surfaceContainerHighest,
      outline: scheme.outline,
      outlineVariant: scheme.outlineVariant,
      // M3 canonical state-layer opacities (Material spec: hover 8%,
      // focus 10%, pressed 10–12% — we use 10% for pressed, splitting the
      // difference since we don't model drag separately).
      stateLayerHover: primary.withValues(alpha: 0.08),
      stateLayerFocus: primary.withValues(alpha: 0.10),
      stateLayerPress: primary.withValues(alpha: 0.10),
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

  // —— M3 additions ——
  final Color onPrimary;
  final Color primaryContainer;
  final Color onPrimaryContainer;
  final Color onAccent;
  final Color accentContainer;
  final Color onAccentContainer;
  final Color tertiary;
  final Color onTertiary;
  final Color tertiaryContainer;
  final Color onTertiaryContainer;
  final Color surfaceContainerLowest;
  final Color surfaceContainerLow;
  final Color surfaceContainer;
  final Color surfaceContainerHigh;
  final Color surfaceContainerHighest;
  final Color outline;
  final Color outlineVariant;
  final Color stateLayerHover;
  final Color stateLayerFocus;
  final Color stateLayerPress;

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
    Color? onPrimary,
    Color? primaryContainer,
    Color? onPrimaryContainer,
    Color? onAccent,
    Color? accentContainer,
    Color? onAccentContainer,
    Color? tertiary,
    Color? onTertiary,
    Color? tertiaryContainer,
    Color? onTertiaryContainer,
    Color? surfaceContainerLowest,
    Color? surfaceContainerLow,
    Color? surfaceContainer,
    Color? surfaceContainerHigh,
    Color? surfaceContainerHighest,
    Color? outline,
    Color? outlineVariant,
    Color? stateLayerHover,
    Color? stateLayerFocus,
    Color? stateLayerPress,
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
      onPrimary: onPrimary ?? this.onPrimary,
      primaryContainer: primaryContainer ?? this.primaryContainer,
      onPrimaryContainer: onPrimaryContainer ?? this.onPrimaryContainer,
      onAccent: onAccent ?? this.onAccent,
      accentContainer: accentContainer ?? this.accentContainer,
      onAccentContainer: onAccentContainer ?? this.onAccentContainer,
      tertiary: tertiary ?? this.tertiary,
      onTertiary: onTertiary ?? this.onTertiary,
      tertiaryContainer: tertiaryContainer ?? this.tertiaryContainer,
      onTertiaryContainer: onTertiaryContainer ?? this.onTertiaryContainer,
      surfaceContainerLowest:
          surfaceContainerLowest ?? this.surfaceContainerLowest,
      surfaceContainerLow: surfaceContainerLow ?? this.surfaceContainerLow,
      surfaceContainer: surfaceContainer ?? this.surfaceContainer,
      surfaceContainerHigh: surfaceContainerHigh ?? this.surfaceContainerHigh,
      surfaceContainerHighest:
          surfaceContainerHighest ?? this.surfaceContainerHighest,
      outline: outline ?? this.outline,
      outlineVariant: outlineVariant ?? this.outlineVariant,
      stateLayerHover: stateLayerHover ?? this.stateLayerHover,
      stateLayerFocus: stateLayerFocus ?? this.stateLayerFocus,
      stateLayerPress: stateLayerPress ?? this.stateLayerPress,
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
      onPrimary: l(onPrimary, other.onPrimary),
      primaryContainer: l(primaryContainer, other.primaryContainer),
      onPrimaryContainer: l(onPrimaryContainer, other.onPrimaryContainer),
      onAccent: l(onAccent, other.onAccent),
      accentContainer: l(accentContainer, other.accentContainer),
      onAccentContainer: l(onAccentContainer, other.onAccentContainer),
      tertiary: l(tertiary, other.tertiary),
      onTertiary: l(onTertiary, other.onTertiary),
      tertiaryContainer: l(tertiaryContainer, other.tertiaryContainer),
      onTertiaryContainer: l(onTertiaryContainer, other.onTertiaryContainer),
      surfaceContainerLowest:
          l(surfaceContainerLowest, other.surfaceContainerLowest),
      surfaceContainerLow: l(surfaceContainerLow, other.surfaceContainerLow),
      surfaceContainer: l(surfaceContainer, other.surfaceContainer),
      surfaceContainerHigh:
          l(surfaceContainerHigh, other.surfaceContainerHigh),
      surfaceContainerHighest:
          l(surfaceContainerHighest, other.surfaceContainerHighest),
      outline: l(outline, other.outline),
      outlineVariant: l(outlineVariant, other.outlineVariant),
      stateLayerHover: l(stateLayerHover, other.stateLayerHover),
      stateLayerFocus: l(stateLayerFocus, other.stateLayerFocus),
      stateLayerPress: l(stateLayerPress, other.stateLayerPress),
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
