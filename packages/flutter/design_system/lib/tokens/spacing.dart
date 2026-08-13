import 'package:flutter/material.dart';

/// 8pt spacing scale — no exceptions.
abstract final class AppSpacing {
  static const double s0 = 0;
  static const double s1 = 4;
  static const double s2 = 8;
  static const double s3 = 12;
  static const double s4 = 16;
  static const double s5 = 20;
  static const double s6 = 24;
  static const double s8 = 32;
  static const double s10 = 40;
  static const double s12 = 48;
  static const double s16 = 64;

  /// Screen edge → content (mobile).
  static const double screenPadding = s4;

  /// Label → its input (6px — the one intentional off-grid value).
  static const double labelToField = 6;

  /// Alias used by input components.
  static const double labelToInput = labelToField;

  /// Two lines in one list row.
  static const double lineGap = 2;
}

abstract final class AppRadius {
  static const double sm = 6;
  static const double md = 10;
  static const double lg = 16;
  static const double full = 999;

  static final BorderRadius smAll = BorderRadius.circular(sm);
  static final BorderRadius mdAll = BorderRadius.circular(md);
  static final BorderRadius lgAll = BorderRadius.circular(lg);
  static final BorderRadius fullAll = BorderRadius.circular(full);

  /// Aliases used by ThemeData factories and components.
  static final BorderRadius borderSm = smAll;
  static final BorderRadius borderMd = mdAll;
  static final BorderRadius borderLg = lgAll;
  static final BorderRadius borderFull = fullAll;
  static const BorderRadius sheetTop = BorderRadius.vertical(
    top: Radius.circular(lg),
  );
}

abstract final class AppShadows {
  static const List<BoxShadow> sm = [
    BoxShadow(
      color: Color(0x0F16202B), // rgba(22,32,43,0.06)
      offset: Offset(0, 1),
      blurRadius: 2,
    ),
  ];

  static const List<BoxShadow> md = [
    BoxShadow(
      color: Color(0x1A16202B), // rgba(22,32,43,0.10)
      offset: Offset(0, 4),
      blurRadius: 12,
    ),
  ];
}

abstract final class AppDurations {
  static const Duration instant = Duration(milliseconds: 100);
  static const Duration fast = Duration(milliseconds: 160);
  static const Duration base = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 320);
}

abstract final class AppCurves {
  static const Curve standard = Cubic(0.2, 0, 0, 1);
  static const Curve decelerate = Cubic(0, 0, 0, 1);
  static const Curve accelerate = Cubic(0.3, 0, 1, 1);
}
