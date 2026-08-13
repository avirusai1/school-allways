import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../../../router/routes.dart';
import '../../paywall/presentation/paywall_panel.dart';

enum HomeworkFilter { pending, completed, all }

class HomeworkItem {
  const HomeworkItem({
    required this.id,
    required this.title,
    required this.submissionStatus,
    this.description,
    this.dueOn,
    this.assignedOn,
    this.seenAt,
  });

  final String id;
  final String title;
  final String submissionStatus;
  final String? description;
  final String? dueOn;
  final String? assignedOn;
  final String? seenAt;

  bool get isPending =>
      submissionStatus == 'pending' || submissionStatus == 'seen';
  bool get isCompleted =>
      submissionStatus == 'submitted' || submissionStatus == 'graded';

  bool get isOverdue {
    if (dueOn == null || !isPending) return false;
    final today = DateTime.now().toIso8601String().substring(0, 10);
    return dueOn!.compareTo(today) < 0;
  }

  factory HomeworkItem.fromJson(Map<String, dynamic> json) {
    return HomeworkItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      description: json['description'] as String?,
      dueOn: json['dueOn'] as String?,
      assignedOn: json['assignedOn'] as String?,
      submissionStatus: json['submissionStatus'] as String? ?? 'pending',
      seenAt: json['seenAt'] as String?,
    );
  }
}

final homeworkFilterProvider =
    StateProvider<HomeworkFilter>((ref) => HomeworkFilter.pending);

final homeworkFeedProvider =
    FutureProvider.autoDispose<List<HomeworkItem>>((ref) async {
  final studentId = ref.watch(childSwitcherProvider).valueOrNull;
  if (studentId == null || studentId.isEmpty) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/homework/feed',
    queryParameters: {'studentId': studentId},
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .map((e) => HomeworkItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

class HomeworkScreen extends ConsumerWidget {
  const HomeworkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final filter = ref.watch(homeworkFilterProvider);
    final feed = ref.watch(homeworkFeedProvider);

    return Column(
      children: [
        const SawAppBar(title: 'Homework'),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.s4,
            AppSpacing.s3,
            AppSpacing.s4,
            0,
          ),
          child: Row(
            children: [
              for (final f in HomeworkFilter.values) ...[
                Expanded(
                  child: AppButton(
                    label: switch (f) {
                      HomeworkFilter.pending => 'Pending',
                      HomeworkFilter.completed => 'Completed',
                      HomeworkFilter.all => 'All',
                    },
                    size: AppButtonSize.compact,
                    variant: filter == f
                        ? AppButtonVariant.secondary
                        : AppButtonVariant.outline,
                    onPressed: () =>
                        ref.read(homeworkFilterProvider.notifier).state = f,
                  ),
                ),
                if (f != HomeworkFilter.all)
                  const SizedBox(width: AppSpacing.s2),
              ],
            ],
          ),
        ),
        Expanded(
          child: feed.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: GatedPaywallOrError(
                error: e,
                fallbackMessage: 'Could not load homework.',
                onRetry: () => ref.invalidate(homeworkFeedProvider),
              ),
            ),
            data: (items) {
              final filtered = items.where((i) {
                return switch (filter) {
                  HomeworkFilter.pending => i.isPending,
                  HomeworkFilter.completed => i.isCompleted,
                  HomeworkFilter.all => true,
                };
              }).toList();

              if (filtered.isEmpty) {
                  return EmptyState(
                  icon: PhosphorIconsRegular.notebook,
                  headline: 'No homework',
                  body: 'Nothing in this list for your child right now.',
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.all(AppSpacing.s4),
                itemCount: filtered.length,
                itemBuilder: (context, index) {
                  final item = filtered[index];
                  return Container(
                    margin: const EdgeInsets.only(bottom: AppSpacing.s2),
                    decoration: BoxDecoration(
                      color: t.surface,
                      borderRadius: AppRadius.borderMd,
                      border: Border(
                        left: BorderSide(
                          width: 3,
                          color: item.isOverdue ? t.warning : t.border,
                        ),
                        top: BorderSide(color: t.border),
                        right: BorderSide(color: t.border),
                        bottom: BorderSide(color: t.border),
                      ),
                    ),
                    child: ListTile(
                      title: Text(
                        item.title,
                        style: AppTypography.bodyMedium(color: t.textPrimary),
                      ),
                      subtitle: Text(
                        item.dueOn == null
                            ? item.submissionStatus
                            : 'Due ${item.dueOn} · ${item.submissionStatus}',
                        style: AppTypography.bodySmall(color: t.textTertiary),
                      ),
                      onTap: () =>
                          context.push(Routes.homeworkDetail(item.id)),
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

class HomeworkDetailScreen extends ConsumerStatefulWidget {
  const HomeworkDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<HomeworkDetailScreen> createState() =>
      _HomeworkDetailScreenState();
}

class _HomeworkDetailScreenState extends ConsumerState<HomeworkDetailScreen> {
  HomeworkItem? _item;
  var _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final studentId = ref.read(childSwitcherProvider).valueOrNull;
    if (studentId == null) {
      setState(() {
        _loading = false;
        _error = 'No child selected';
      });
      return;
    }
    try {
      final items = await ref.read(homeworkFeedProvider.future);
      final match = items.where((i) => i.id == widget.id).firstOrNull;
      if (match != null && match.seenAt == null) {
        await ref.read(apiClientProvider).post<void>(
          '/homework/${widget.id}/seen',
          data: {'studentId': studentId},
        );
      }
      setState(() {
        _item = match;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not open homework';
        _loading = false;
      });
    }
  }

  Future<void> _markDone() async {
    final studentId = ref.read(childSwitcherProvider).valueOrNull;
    if (studentId == null || _item == null) return;
    try {
      await ref.read(apiClientProvider).post<void>(
        '/homework/${widget.id}/submit',
        data: {'studentId': studentId, 'body': 'Marked done by parent'},
      );
      ref.invalidate(homeworkFeedProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Homework'),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  child: ErrorState(message: _error!),
                )
              : _item == null
                  ? const EmptyState(
                      icon: PhosphorIconsRegular.notebook,
                      headline: 'Not found',
                      body: 'This homework is no longer available.',
                    )
                  : Padding(
                      padding: const EdgeInsets.all(AppSpacing.s4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            _item!.title,
                            style: AppTypography.h2(color: t.textPrimary),
                          ),
                          const SizedBox(height: AppSpacing.s2),
                          Text(
                            [
                              if (_item!.assignedOn != null)
                                'Assigned ${_item!.assignedOn}',
                              if (_item!.dueOn != null) 'Due ${_item!.dueOn}',
                            ].join(' · '),
                            style: AppTypography.bodySmall(color: t.textTertiary),
                          ),
                          const SizedBox(height: AppSpacing.s4),
                          Text(
                            _item!.description ?? 'No description.',
                            style: AppTypography.body(color: t.textPrimary),
                          ),
                          const Spacer(),
                          if (_item!.isPending)
                            AppButton(
                              label: 'Mark as done',
                              expanded: true,
                              onPressed: _markDone,
                            ),
                        ],
                      ),
                    ),
    );
  }
}
