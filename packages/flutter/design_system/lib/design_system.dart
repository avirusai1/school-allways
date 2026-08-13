/// School All Ways design system — tokens + components.
///
/// ## Feature widgets rule
/// Feature / screen code MUST use [Theme.of] and [AppThemeExtension]
/// (via `context.tokens`) — NEVER import [AppColors] directly. Tokens and the
/// theme factory are the only places that reference ramp values.
///
/// See build/11-design-system.md.
library design_system;

// Tokens (for theme factory / design_system internals only)
export 'tokens/colors.dart';
export 'tokens/typography.dart';
export 'tokens/spacing.dart';
export 'tokens/radius.dart';
export 'tokens/elevation.dart';
export 'tokens/motion.dart';

// Theme
export 'theme/app_theme.dart';
export 'theme/theme_extensions.dart';

// Buttons
export 'components/buttons/app_button.dart';
export 'components/buttons/icon_button.dart';

// Inputs
export 'components/inputs/app_text_field.dart';
export 'components/inputs/app_dropdown.dart';
export 'components/inputs/app_date_field.dart';

// Display
export 'components/display/app_card.dart';
export 'components/display/app_list_tile.dart';
export 'components/display/app_chip.dart';
export 'components/display/stat_tile.dart';
export 'components/display/avatar.dart';
export 'components/display/section_header.dart';

// Feedback
export 'components/feedback/empty_state.dart';
export 'components/feedback/error_state.dart';
export 'components/feedback/skeleton.dart';
export 'components/feedback/app_snackbar.dart';
export 'components/feedback/confirm_dialog.dart';

// Layout
export 'components/layout/app_scaffold.dart';
export 'components/layout/app_bar.dart';
export 'components/layout/bottom_nav.dart';
export 'components/layout/app_bottom_sheet.dart';

// Domain
export 'components/domain/attendance_chip.dart';
export 'components/domain/student_tile.dart';
export 'components/domain/money_text.dart';
export 'components/domain/fee_status_badge.dart';
export 'components/domain/date_text.dart';
