/// Shared feature widgets for both apps.
///
/// Domain primitives live in [design_system]; this package re-exports them
/// and will host higher-level feature composites as screens land.
library core_ui;

export 'package:design_system/design_system.dart'
    show
        AttendanceChip,
        AttendanceStatus,
        StudentTile,
        MoneyText,
        formatIndianMoney,
        formatIndianNumber,
        FeeStatusBadge,
        FeeStatus,
        AppChip,
        AppChipTone,
        AppListTile,
        AppAvatar,
        EmptyState,
        ErrorState,
        StatTile,
        SectionHeader;
