import 'package:flutter/material.dart';

import '../../theme/theme_extensions.dart';
import '../../tokens/radius.dart';
import '../../tokens/typography.dart';

/// Circular avatar — initials or image. Radius full.
class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    this.imageUrl,
    this.initials,
    this.size = 40,
    this.backgroundColor,
  });

  final String? imageUrl;
  final String? initials;
  final double size;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final bg = backgroundColor ?? t.primary.withOpacity(0.12);

    Widget child;
    if (imageUrl != null && imageUrl!.isNotEmpty) {
      child = Image.network(
        imageUrl!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _initials(t),
      );
    } else {
      child = _initials(t);
    }

    return ClipRRect(
      borderRadius: AppRadius.borderFull,
      child: Container(
        width: size,
        height: size,
        color: bg,
        alignment: Alignment.center,
        child: child,
      ),
    );
  }

  Widget _initials(AppThemeExtension t) {
    final text = (initials ?? '?').toUpperCase();
    return Text(
      text.length > 2 ? text.substring(0, 2) : text,
      style: AppTypography.label(color: t.primary).copyWith(
            fontSize: size * 0.35,
            fontWeight: FontWeight.w600,
          ),
    );
  }
}
