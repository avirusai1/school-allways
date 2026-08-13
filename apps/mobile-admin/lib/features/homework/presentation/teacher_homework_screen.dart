import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/routes.dart';

class HomeworkPost {
  const HomeworkPost({
    required this.id,
    required this.title,
    this.dueOn,
    this.seenCount = 0,
    this.submittedCount = 0,
  });

  final String id;
  final String title;
  final String? dueOn;
  final int seenCount;
  final int submittedCount;

  factory HomeworkPost.fromJson(Map<String, dynamic> json) {
    return HomeworkPost(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      dueOn: json['dueOn'] as String?,
      seenCount: json['seenCount'] as int? ?? 0,
      submittedCount: json['submittedCount'] as int? ?? 0,
    );
  }
}

final teacherHomeworkProvider =
    FutureProvider.autoDispose<List<HomeworkPost>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/homework',
    queryParameters: {'limit': 50},
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(HomeworkPost.fromJson)
      .toList();
});

class TeacherHomeworkScreen extends ConsumerWidget {
  const TeacherHomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final async = ref.watch(teacherHomeworkProvider);

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Homework'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(AdminRoutes.composeHomework),
        backgroundColor: t.accent,
        foregroundColor: t.textOnAccent,
        icon: const Icon(PhosphorIconsRegular.plus),
        label: const Text('Post'),
      ),
      body: async.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.s4),
          child: SkeletonList(),
        ),
        error: (_, __) => Padding(
          padding: const EdgeInsets.all(AppSpacing.s4),
          child: ErrorState(
            message: 'Could not load homework.',
            onRetry: () => ref.invalidate(teacherHomeworkProvider),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return EmptyState(
              icon: PhosphorIconsRegular.notebook,
              headline: 'No homework posted',
              body: 'Posted homework shows seen and submitted counts here.',
              actionLabel: 'Post homework',
              onAction: () => context.push(AdminRoutes.composeHomework),
            );
          }
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              return AppListTile(
                dense: true,
                title: item.title,
                subtitle:
                    '${item.seenCount} seen · ${item.submittedCount} submitted'
                    '${item.dueOn == null ? '' : ' · Due ${item.dueOn}'}',
              );
            },
          );
        },
      ),
    );
  }
}
