import 'package:flutter/material.dart';

import '../display/app_list_tile.dart';
import '../display/avatar.dart';
import 'attendance_chip.dart';

/// Shared student row used across attendance, directory, and fee screens.
class StudentTile extends StatelessWidget {
  const StudentTile({
    super.key,
    required this.name,
    this.subtitle,
    this.rollNumber,
    this.avatarUrl,
    this.attendance,
    this.trailing,
    this.onTap,
    this.showDivider = true,
  });

  final String name;
  final String? subtitle;
  final String? rollNumber;
  final String? avatarUrl;
  final AttendanceStatus? attendance;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(name);
    final sub = subtitle ??
        (rollNumber != null ? 'Roll $rollNumber' : null);

    Widget? trail = trailing;
    if (attendance != null) {
      trail = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (trailing != null) ...[trailing!, const SizedBox(width: 8)],
          AttendanceChip(status: attendance!),
        ],
      );
    }

    return AppListTile(
      title: name,
      subtitle: sub,
      leading: AppAvatar(imageUrl: avatarUrl, initials: initials),
      trailing: trail,
      onTap: onTap,
      showDivider: showDivider,
      showChevron: onTap != null && trail == null,
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1);
    return '${parts.first[0]}${parts.last[0]}';
  }
}
