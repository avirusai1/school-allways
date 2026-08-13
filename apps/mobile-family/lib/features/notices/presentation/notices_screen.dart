import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/routes.dart';

class NoticeItem {
  const NoticeItem({
    required this.id,
    required this.title,
    required this.type,
    this.body,
    this.sentAt,
    this.requiresAcknowledgement = false,
  });

  final String id;
  final String title;
  final String type;
  final String? body;
  final String? sentAt;
  final bool requiresAcknowledgement;

  factory NoticeItem.fromJson(Map<String, dynamic> json) {
    return NoticeItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      type: json['type'] as String? ?? 'circular',
      body: json['body'] as String?,
      sentAt: json['sentAt'] as String?,
      requiresAcknowledgement:
          json['requiresAcknowledgement'] as bool? ?? false,
    );
  }
}

final noticeFilterProvider = StateProvider<String?>((ref) => null);

final noticesProvider =
    FutureProvider.autoDispose<List<NoticeItem>>((ref) async {
  final type = ref.watch(noticeFilterProvider);
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/announcements',
    queryParameters: {
      if (type != null) 'type': type,
      'limit': 50,
    },
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .map((e) => NoticeItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

class NoticesScreen extends ConsumerWidget {
  const NoticesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final filter = ref.watch(noticeFilterProvider);
    final notices = ref.watch(noticesProvider);

    const filters = <(String?, String)>[
      (null, 'All'),
      ('circular', 'Circulars'),
      ('event', 'Events'),
      ('exam', 'Exams'),
      ('fee', 'Fees'),
    ];

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Notices'),
      body: Column(
        children: [
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s4),
              itemCount: filters.length,
              separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.s2),
              itemBuilder: (context, i) {
                final (value, label) = filters[i];
                final selected = filter == value;
                return InkWell(
                  onTap: () =>
                      ref.read(noticeFilterProvider.notifier).state = value,
                  borderRadius: AppRadius.fullAll,
                  child: AppChip(
                    label: label,
                    tone: selected ? AppChipTone.info : AppChipTone.neutral,
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: notices.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(AppSpacing.s4),
                child: SkeletonList(),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.all(AppSpacing.s4),
                child: ErrorState(
                  message: 'Could not load notices.',
                  onRetry: () => ref.invalidate(noticesProvider),
                ),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return EmptyState(
                    icon: PhosphorIconsRegular.megaphone,
                    headline: 'No notices',
                    body: 'School circulars and events will show up here.',
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final item = items[index];
                    return AppListTile(
                      title: item.title,
                      subtitle: [
                        if (item.body != null) item.body!,
                        if (item.sentAt != null) item.sentAt!,
                      ].join('\n'),
                      onTap: () =>
                          context.push(Routes.noticeDetail(item.id)),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class NoticeDetailScreen extends ConsumerStatefulWidget {
  const NoticeDetailScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<NoticeDetailScreen> createState() => _NoticeDetailScreenState();
}

class _NoticeDetailScreenState extends ConsumerState<NoticeDetailScreen> {
  NoticeItem? _item;
  var _loading = true;
  var _acking = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await ref.read(noticesProvider.future);
      setState(() {
        _item = items.where((n) => n.id == widget.id).firstOrNull;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not open notice';
        _loading = false;
      });
    }
  }

  Future<void> _ack() async {
    setState(() => _acking = true);
    try {
      await ref
          .read(apiClientProvider)
          .post<void>('/announcements/${widget.id}/acknowledge');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Acknowledged')),
        );
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _acking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Notice'),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _item == null
              ? ErrorState(message: _error ?? 'Notice not found')
              : Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.all(AppSpacing.s4),
                        children: [
                          Text(
                            _item!.title,
                            style: AppTypography.h2(color: t.textPrimary),
                          ),
                          if (_item!.sentAt != null) ...[
                            const SizedBox(height: AppSpacing.s2),
                            Text(
                              _item!.sentAt!,
                              style: AppTypography.caption(color: t.textTertiary),
                            ),
                          ],
                          const SizedBox(height: AppSpacing.s4),
                          Text(
                            _item!.body ?? '',
                            style: AppTypography.body(color: t.textPrimary),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: AppSpacing.s3),
                            Text(
                              _error!,
                              style: AppTypography.bodySmall(color: t.dangerText),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (_item!.requiresAcknowledgement)
                      SafeArea(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.s4),
                          child: AppButton(
                            label: 'I have read this',
                            expanded: true,
                            loading: _acking,
                            onPressed: _acking ? null : _ack,
                          ),
                        ),
                      ),
                  ],
                ),
    );
  }
}
