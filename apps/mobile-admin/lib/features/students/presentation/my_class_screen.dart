import 'package:core_auth/core_auth.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../core/sync_chrome.dart';

class StudentRow {
  const StudentRow({
    required this.id,
    required this.fullName,
    this.rollNo,
    this.photoUrl,
    this.attendancePercent,
    this.feeDue = false,
    this.isBirthday = false,
    this.absentToday = false,
  });

  final String id;
  final String fullName;
  final String? rollNo;
  final String? photoUrl;
  final double? attendancePercent;
  final bool feeDue;
  final bool isBirthday;
  final bool absentToday;

  factory StudentRow.fromJson(Map<String, dynamic> json) {
    return StudentRow(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ??
          [json['firstName'], json['lastName']].whereType<String>().join(' '),
      rollNo: json['rollNo'] as String?,
      photoUrl: json['photoUrl'] as String? ?? json['photoPath'] as String?,
      attendancePercent: (json['attendancePercent'] as num?)?.toDouble() ??
          (json['attendancePct'] as num?)?.toDouble(),
      feeDue: json['feeDue'] as bool? ??
          ((json['outstandingPaise'] as int? ?? 0) > 0),
      isBirthday: json['isBirthday'] as bool? ?? false,
      absentToday: json['absentToday'] as bool? ?? false,
    );
  }
}

enum _ClassFilter { all, absentToday, feeDue, birthdays }

final myClassStudentsProvider =
    FutureProvider.autoDispose<List<StudentRow>>((ref) async {
  final sectionIds =
      ref.watch(sessionProvider).valueOrNull?.scopes.sectionIds ?? const [];
  if (sectionIds.isEmpty) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/students',
    queryParameters: {
      'sectionId': sectionIds.first,
      'limit': 100,
    },
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(StudentRow.fromJson)
      .toList();
});

class MyClassScreen extends ConsumerStatefulWidget {
  const MyClassScreen({super.key});

  @override
  ConsumerState<MyClassScreen> createState() => _MyClassScreenState();
}

class _MyClassScreenState extends ConsumerState<MyClassScreen> {
  final _search = TextEditingController();
  var _query = '';
  var _filter = _ClassFilter.all;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myClassStudentsProvider);

    return Column(
      children: [
        const SawAppBar(
          title: 'My class',
          actions: [PendingSyncChip()],
        ),
        const OfflineBanner(),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.s4,
            AppSpacing.s3,
            AppSpacing.s4,
            0,
          ),
          child: AppTextField(
            label: 'Search',
            controller: _search,
            hint: 'Name or roll',
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
        ),
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
            children: [
              for (final f in _ClassFilter.values)
                Padding(
                  padding: const EdgeInsets.only(right: AppSpacing.s2),
                  child: FilterChip(
                    label: Text(switch (f) {
                      _ClassFilter.all => 'All',
                      _ClassFilter.absentToday => 'Absent today',
                      _ClassFilter.feeDue => 'Fee due',
                      _ClassFilter.birthdays => 'Birthdays',
                    }),
                    selected: _filter == f,
                    onSelected: (_) => setState(() => _filter = f),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 8, rowHeight: 44),
            ),
            error: (_, __) => Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: ErrorState(
                message: 'Could not load students.',
                onRetry: () => ref.invalidate(myClassStudentsProvider),
              ),
            ),
            data: (students) {
              final filtered = students.where((s) {
                if (_query.isNotEmpty) {
                  final match = s.fullName.toLowerCase().contains(_query) ||
                      (s.rollNo?.toLowerCase().contains(_query) ?? false);
                  if (!match) return false;
                }
                return switch (_filter) {
                  _ClassFilter.all => true,
                  _ClassFilter.absentToday => s.absentToday,
                  _ClassFilter.feeDue => s.feeDue,
                  _ClassFilter.birthdays => s.isBirthday,
                };
              }).toList();
              if (filtered.isEmpty) {
                return EmptyState(
                  icon: PhosphorIconsRegular.student,
                  headline: 'No students',
                  body: _filter == _ClassFilter.all
                      ? 'Your class roster will appear here.'
                      : 'Nothing matches this filter.',
                );
              }
              return ListView.builder(
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final s = filtered[index];
                  final pct = s.attendancePercent;
                  final chipTone = pct == null
                      ? AppChipTone.neutral
                      : pct >= 90
                          ? AppChipTone.success
                          : pct >= 75
                              ? AppChipTone.warning
                              : AppChipTone.danger;
                  return AppListTile(
                    dense: true,
                    leading: AppAvatar(
                      imageUrl: s.photoUrl,
                      initials: s.fullName.isNotEmpty ? s.fullName[0] : '?',
                      size: 32,
                    ),
                    title: s.fullName,
                    subtitle: s.rollNo == null ? null : 'Roll ${s.rollNo}',
                    trailing: pct == null
                        ? null
                        : AppChip(
                            label: '${pct.toStringAsFixed(0)}%',
                            tone: chipTone,
                          ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
