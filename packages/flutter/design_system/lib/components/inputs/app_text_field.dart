import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';
import '../../tokens/spacing.dart';
import '../../tokens/typography.dart';

/// Text field with label ABOVE the field (never floating). Height 48.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.focusNode,
    this.hint,
    this.errorText,
    this.enabled = true,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.onChanged,
    this.onSubmitted,
    this.maxLines = 1,
    this.minLines,
    this.prefix,
    this.suffix,
    this.inputFormatters,
    this.autofillHints,
  });

  final String label;
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final String? hint;
  final String? errorText;
  final bool enabled;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final int? maxLines;
  final int? minLines;
  final Widget? prefix;
  final Widget? suffix;
  final List<TextInputFormatter>? inputFormatters;
  final Iterable<String>? autofillHints;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final hasError = errorText != null && errorText!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: AppTypography.label(color: t.textSecondary)),
        const SizedBox(height: AppSpacing.labelToInput),
        SizedBox(
          height: maxLines == 1 ? 48 : null,
          child: TextField(
            controller: controller,
            focusNode: focusNode,
            enabled: enabled,
            obscureText: obscureText,
            keyboardType: keyboardType,
            textInputAction: textInputAction,
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            maxLines: obscureText ? 1 : maxLines,
            minLines: minLines,
            inputFormatters: inputFormatters,
            autofillHints: autofillHints,
            style: AppTypography.body(
              color: enabled ? t.textPrimary : t.disabledText,
            ),
            cursorColor: t.primary,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: AppTypography.body(color: t.placeholder),
              filled: !enabled,
              fillColor: enabled ? null : t.surfaceAlt,
              prefixIcon: prefix,
              suffixIcon: suffix,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 14,
              ),
              border: _border(t.borderStrong, 1),
              enabledBorder: _border(t.borderStrong, 1),
              focusedBorder: _border(hasError ? t.danger : t.focusRing, 2),
              errorBorder: _border(t.danger, 2),
              focusedErrorBorder: _border(t.danger, 2),
              disabledBorder: _border(t.borderStrong, 1),
              // Error shown below as helper — suppress Material's inline error.
              errorText: null,
            ),
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: AppSpacing.s1),
          Text(errorText!, style: AppTypography.bodySmall(color: t.dangerText)),
        ],
      ],
    );
  }

  OutlineInputBorder _border(Color color, double width) {
    return OutlineInputBorder(
      borderRadius: AppRadius.borderSm,
      borderSide: BorderSide(color: color, width: width),
    );
  }
}
