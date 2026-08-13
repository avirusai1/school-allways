import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../../paywall/presentation/paywall_panel.dart';

class DiaryEntry {
  const DiaryEntry({
    required this.id,
    required this.day,
    required this.entryType,
    required this.body,
    this.teacherName,
  });

  final String id;
  final String day;
  final String entryType;
  final String body;
  final String? teacherName;

  factory DiaryEntry.fromJson(Map<String, dynamic> json) {
    return DiaryEntry(
      id: json['id'] as String? ?? '',
      day: json['day'] as String? ?? '',
      entryType: json['entryType'] as String? ?? 'note',
      body: json['body'] as String? ?? '',
      teacherName: json['teacherName'] as String?,
    );
  }
}

final diaryProvider =
    FutureProvider.autoDispose<List<DiaryEntry>>((ref) async {
  final studentId = ref.watch(childSwitcherProvider).valueOrNull;
  if (studentId == null || studentId.isEmpty) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/homework/diary',
    queryParameters: {'studentId': studentId},
  );
  final data = res.data?['data'] as List<dynamic>? ??
      res.data?['items'] as List<dynamic>? ??
      (res.data is List ? res.data as List<dynamic> : const []);
  return data
      .whereType<Map<String, dynamic>>()
      .map(DiaryEntry.fromJson)
      .toList();
});

class DiaryScreen extends ConsumerWidget {
  const DiaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(diaryProvider);
    final t = context.tokens;

    return Column(
      children: [
        const SawAppBar(title: 'Diary'),
        Expanded(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 5),
            ),
            error: (e, _) => GatedPaywallOrError(
              error: e,
              fallbackMessage: 'Could not load diary.',
              onRetry: () => ref.invalidate(diaryProvider),
            ),
            data: (entries) {
              if (entries.isEmpty) {
                return const EmptyState(
                  icon: Icons.menu_book_outlined,
                  headline: 'No diary entries',
                  body: 'Teachers post class diary notes here.',
                );
              }
              final grouped = <String, List<DiaryEntry>>{};
              for (final e in entries) {
                grouped.putIfAbsent(e.day, () => []).add(e);
              }
              final days = grouped.keys.toList();
              return ListView.builder(
                padding: const EdgeInsets.all(AppSpacing.s4),
                itemCount: days.length,
                itemBuilder: (context, i) {
                  final day = days[i];
                  final items = grouped[day]!;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(
                          top: AppSpacing.s3,
                          bottom: AppSpacing.s2,
                        ),
                        child: Text(
                          day.toUpperCase(),
                          style: AppTypography.overline(color: t.textTertiary),
                        ),
                      ),
                      for (final e in items)
                        AppListTile(
                          title: e.body,
                          subtitle: e.teacherName,
                          leading: AppChip(label: e.entryType),
                        ),
                    ],
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
