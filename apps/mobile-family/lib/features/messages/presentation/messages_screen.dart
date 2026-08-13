import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../../../router/routes.dart';

class MessageThread {
  const MessageThread({
    required this.id,
    required this.displayAs,
    this.subject,
    this.lastMessageAt,
    this.isClosed = false,
  });

  final String id;
  final String displayAs;
  final String? subject;
  final String? lastMessageAt;
  final bool isClosed;

  factory MessageThread.fromJson(Map<String, dynamic> json) {
    return MessageThread(
      id: json['id'] as String? ?? '',
      displayAs: json['displayAs'] as String? ?? 'Teacher',
      subject: json['subject'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      isClosed: json['isClosed'] as bool? ?? false,
    );
  }
}

class ChatMessage {
  const ChatMessage({
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

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String? ?? '',
      senderUserId: json['senderUserId'] as String? ?? '',
      senderDisplayAs: json['senderDisplayAs'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}

final threadsProvider =
    FutureProvider.autoDispose<List<MessageThread>>((ref) async {
  final studentId = ref.watch(childSwitcherProvider).valueOrNull;
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/threads',
    queryParameters: {
      if (studentId != null && studentId.isNotEmpty) 'studentId': studentId,
    },
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .map((e) => MessageThread.fromJson(e as Map<String, dynamic>))
      .toList();
});

final threadMessagesProvider = FutureProvider.autoDispose
    .family<List<ChatMessage>, String>((ref, threadId) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/threads/$threadId/messages',
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
      .toList();
});

class MessagesScreen extends ConsumerWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final threads = ref.watch(threadsProvider);
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
                  onRetry: () => ref.invalidate(threadsProvider),
                ),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return EmptyState(
                    icon: PhosphorIconsRegular.chatCircle,
                    headline: 'No messages',
                    body: 'Conversations with teachers appear here.',
                  );
                }
                return ListView.builder(
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final thread = items[index];
                    final initials = thread.displayAs
                        .split(RegExp(r'\s+'))
                        .where((p) => p.isNotEmpty)
                        .take(2)
                        .map((p) => p[0])
                        .join();
                    return AppListTile(
                      leading: AppAvatar(
                        initials: initials.isEmpty ? 'T' : initials,
                        backgroundColor: t.primary.withValues(alpha: 0.12),
                      ),
                      title: thread.displayAs,
                      subtitle: thread.subject ?? thread.lastMessageAt,
                      showChevron: true,
                      onTap: () =>
                          context.push(Routes.messageThread(thread.id)),
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

class MessageThreadScreen extends ConsumerStatefulWidget {
  const MessageThreadScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<MessageThreadScreen> createState() =>
      _MessageThreadScreenState();
}

class _MessageThreadScreenState extends ConsumerState<MessageThreadScreen> {
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
      ref.invalidate(threadMessagesProvider(widget.id));
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
    final messages = ref.watch(threadMessagesProvider(widget.id));
    final myId = ref.watch(sessionProvider).valueOrNull?.user.id;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Conversation'),
      body: Column(
        children: [
          // Quiet hours — school-set window from session settings.
          Builder(
            builder: (context) {
              final settings =
                  ref.watch(sessionProvider).valueOrNull?.settings;
              final end = settings?.quietHoursEnd ?? '7:00 AM';
              return Container(
                width: double.infinity,
                color: t.surfaceAlt,
                padding: const EdgeInsets.all(AppSpacing.s3),
                child: Text(
                  'Messages sent now will be delivered at $end.',
                  style: AppTypography.bodySmall(color: t.textSecondary),
                ),
              );
            },
          ),
          Expanded(
            child: messages.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(AppSpacing.s4),
                child: SkeletonList(count: 4, rowHeight: 64),
              ),
              error: (_, __) => ErrorState(
                message: 'Could not load messages.',
                onRetry: () =>
                    ref.invalidate(threadMessagesProvider(widget.id)),
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
                          hintText: 'Message',
                          filled: true,
                          fillColor: t.surface,
                          border: OutlineInputBorder(
                            borderRadius: AppRadius.borderMd,
                            borderSide: BorderSide(color: t.border),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: AppRadius.borderMd,
                            borderSide: BorderSide(color: t.border),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.s2),
                  IconButton(
                    onPressed: _sending ? null : _send,
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
