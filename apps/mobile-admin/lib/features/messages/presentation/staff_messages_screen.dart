import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/routes.dart';

class StaffThread {
  const StaffThread({
    required this.id,
    required this.displayAs,
    this.subject,
    this.lastMessageAt,
    this.studentId,
  });

  final String id;
  final String displayAs;
  final String? subject;
  final String? lastMessageAt;
  final String? studentId;

  factory StaffThread.fromJson(Map<String, dynamic> json) {
    return StaffThread(
      id: json['id'] as String? ?? '',
      displayAs: json['displayAs'] as String? ?? 'Parent',
      subject: json['subject'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      studentId: json['studentId'] as String?,
    );
  }
}

class StaffMessage {
  const StaffMessage({
    required this.id,
    required this.senderUserId,
    required this.senderDisplayAs,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final String senderUserId;
  final String senderDisplayAs;
  final String body;
  final String createdAt;

  factory StaffMessage.fromJson(Map<String, dynamic> json) {
    return StaffMessage(
      id: json['id'] as String? ?? '',
      senderUserId: json['senderUserId'] as String? ?? '',
      senderDisplayAs: json['senderDisplayAs'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}

final staffThreadsProvider =
    FutureProvider.autoDispose<List<StaffThread>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/threads');
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(StaffThread.fromJson)
      .toList();
});

final staffMessagesProvider = FutureProvider.autoDispose
    .family<List<StaffMessage>, String>((ref, threadId) async {
  final api = ref.watch(apiClientProvider);
  final res =
      await api.get<Map<String, dynamic>>('/threads/$threadId/messages');
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(StaffMessage.fromJson)
      .toList();
});

class StaffMessagesScreen extends ConsumerWidget {
  const StaffMessagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final threads = ref.watch(staffThreadsProvider);
    final hour = DateTime.now().hour;
    final outsideHours = hour < 7 || hour >= 20;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Messages'),
      body: Column(
        children: [
          if (outsideHours)
            Container(
              width: double.infinity,
              color: t.surfaceAlt,
              padding: const EdgeInsets.all(AppSpacing.s3),
              child: Text(
                'Messages sent now will be delivered at 7:00 AM.',
                style: AppTypography.bodySmall(color: t.textSecondary),
              ),
            ),
          Expanded(
            child: threads.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(AppSpacing.s4),
                child: SkeletonList(),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.all(AppSpacing.s4),
                child: ErrorState(
                  message: 'Could not load messages.',
                  onRetry: () => ref.invalidate(staffThreadsProvider),
                ),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return EmptyState(
                    icon: PhosphorIconsRegular.chatCircle,
                    headline: 'No conversations',
                    body: 'Parent threads for students in your scope appear here.',
                  );
                }
                // Group by studentId when present.
                final groups = <String, List<StaffThread>>{};
                for (final t in items) {
                  final key = t.studentId ?? 'general';
                  groups.putIfAbsent(key, () => []).add(t);
                }
                final keys = groups.keys.toList();
                return ListView.builder(
                  itemCount: keys.length,
                  itemBuilder: (context, gi) {
                    final key = keys[gi];
                    final group = groups[key]!;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(
                            AppSpacing.s4,
                            AppSpacing.s3,
                            AppSpacing.s4,
                            AppSpacing.s1,
                          ),
                          child: Text(
                            key == 'general' ? 'General' : 'Class thread',
                            style: AppTypography.overline(color: t.textTertiary),
                          ),
                        ),
                        for (final thread in group)
                          AppListTile(
                            leading: AppAvatar(
                              initials: thread.displayAs.isNotEmpty
                                  ? thread.displayAs[0]
                                  : 'P',
                              size: 40,
                            ),
                            title: thread.displayAs,
                            subtitle: thread.subject ?? thread.lastMessageAt,
                            showChevron: true,
                            onTap: () => context.push(
                              AdminRoutes.messageThread(thread.id),
                            ),
                          ),
                      ],
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

class StaffMessageThreadScreen extends ConsumerStatefulWidget {
  const StaffMessageThreadScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<StaffMessageThreadScreen> createState() =>
      _StaffMessageThreadScreenState();
}

class _StaffMessageThreadScreenState
    extends ConsumerState<StaffMessageThreadScreen> {
  final _controller = TextEditingController();
  var _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(apiClientProvider).post<void>(
        '/threads/${widget.id}/messages',
        data: {'body': body},
      );
      _controller.clear();
      ref.invalidate(staffMessagesProvider(widget.id));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final messages = ref.watch(staffMessagesProvider(widget.id));
    final myId = ref.watch(sessionProvider).valueOrNull?.user.id;
    final hour = DateTime.now().hour;
    final outsideHours = hour < 7 || hour >= 20;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Conversation'),
      body: Column(
        children: [
          if (outsideHours)
            Container(
              width: double.infinity,
              color: t.surfaceAlt,
              padding: const EdgeInsets.all(AppSpacing.s3),
              child: Text(
                'Outside school hours — will deliver at 7:00 AM.',
                style: AppTypography.bodySmall(color: t.textSecondary),
              ),
            ),
          Expanded(
            child: messages.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => ErrorState(
                message: 'Could not load messages.',
                onRetry: () =>
                    ref.invalidate(staffMessagesProvider(widget.id)),
              ),
              data: (items) {
                return ListView.builder(
                  padding: const EdgeInsets.all(AppSpacing.s4),
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final msg = items[index];
                    final mine = msg.senderUserId == myId;
                    return Align(
                      alignment:
                          mine ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: AppSpacing.s2),
                        padding: const EdgeInsets.all(AppSpacing.s3),
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
                        ),
                        decoration: BoxDecoration(
                          color: mine ? t.primary : t.surfaceAlt,
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(AppRadius.md),
                            topRight: const Radius.circular(AppRadius.md),
                            bottomLeft: Radius.circular(
                              mine ? AppRadius.md : AppRadius.sm,
                            ),
                            bottomRight: Radius.circular(
                              mine ? AppRadius.sm : AppRadius.md,
                            ),
                          ),
                        ),
                        child: Text(
                          msg.body,
                          style: AppTypography.body(
                            color: mine ? t.textOnPrimary : t.textPrimary,
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.s3),
              child: Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 48,
                      child: TextField(
                        controller: _controller,
                        style: AppTypography.body(color: t.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Message parent',
                          filled: true,
                          fillColor: t.surface,
                          border: OutlineInputBorder(
                            borderRadius: AppRadius.borderMd,
                            borderSide: BorderSide(color: t.border),
                          ),
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: _sending || _controller.text.trim().isEmpty
                        ? null
                        : _send,
                    icon: Icon(
                      PhosphorIconsRegular.paperPlaneTilt,
                      color: _controller.text.trim().isEmpty
                          ? t.disabledText
                          : t.accent,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
