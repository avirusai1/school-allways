import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../tokens/colors.dart';
import '../tokens/radius.dart';
import '../tokens/typography.dart';
import 'theme_extensions.dart';

/// Builds a complete [ThemeData] so a white-labelled school re-themes with
/// one value ([primaryColor] = their blue/500 override).
///
/// Light-only for v1 — a half-tuned dark mode looks more amateur than none.
abstract final class AppTheme {
  static ThemeData build([Color? primaryColor]) {
    final ext = AppThemeExtension.fromPrimary(primaryColor);
    final primary = ext.primary;

    final colorScheme = ColorScheme.light(
      primary: primary,
      onPrimary: ext.textOnPrimary,
      secondary: ext.accent,
      onSecondary: ext.textOnAccent,
      error: ext.danger,
      onError: ext.textOnPrimary,
      surface: ext.surface,
      onSurface: ext.textPrimary,
      surfaceContainerHighest: ext.surfaceAlt,
      outline: ext.border,
      outlineVariant: ext.borderStrong,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: ext.appBackground,
      textTheme: AppTypography.textTheme(primary: ext.textPrimary),
      extensions: <ThemeExtension<dynamic>>[
        ext,
        const AppDensityExtension(density: AppDensity.comfortable),
      ],
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: ext.surface,
        foregroundColor: ext.textPrimary,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: AppTypography.h1(color: ext.textPrimary),
        toolbarHeight: 56,
        shape: Border(
          bottom: BorderSide(color: ext.border, width: 1),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: ext.border,
        thickness: 1,
        space: 1,
      ),
      cardTheme: CardThemeData(
        color: ext.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.borderMd,
          side: BorderSide(color: ext.border, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: false,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: AppRadius.borderSm,
          borderSide: BorderSide(color: ext.borderStrong, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.borderSm,
          borderSide: BorderSide(color: ext.borderStrong, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.borderSm,
          borderSide: BorderSide(color: primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadius.borderSm,
          borderSide: BorderSide(color: ext.danger, width: 2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: AppRadius.borderSm,
          borderSide: BorderSide(color: ext.danger, width: 2),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.borderSm,
          borderSide: BorderSide(color: ext.borderStrong, width: 1),
        ),
        hintStyle: AppTypography.body(color: ext.placeholder),
        errorStyle: AppTypography.bodySmall(color: ext.dangerText),
        labelStyle: AppTypography.label(color: ext.textSecondary),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.grey800,
        contentTextStyle: AppTypography.body(color: AppColors.grey0),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.borderMd),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: ext.surface,
        selectedItemColor: primary,
        unselectedItemColor: ext.textTertiary,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: ext.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.borderMd),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: ext.surface,
        elevation: 0,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.sheetTop),
        showDragHandle: true,
      ),
      // Suppress Material purple defaults.
      splashFactory: InkRipple.splashFactory,
    );
  }
}
