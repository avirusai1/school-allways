import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../students/presentation/my_class_screen.dart';

class DiaryEntry {
  const DiaryEntry({
    required this.id,
    required this.day,
    required this.body,
    this.entryType = 'note',
  });

  final String id;
  final String day;
  final String body;
  final String entryType;

  factory DiaryEntry.fromJson(Map<String, dynamic> json) {
    return DiaryEntry(
      id: json['id'] as String? ?? '',
      day: json['day'] as String? ?? '',
      body: json['body'] as String? ?? '',
      entryType: json['entryType'] as String? ?? 'note',
    );
  }
}

final diaryStudentIdProvider = StateProvider<String?>((ref) => null);

final diaryStudentsProvider =
    FutureProvider.autoDispose<List<StudentRow>>((ref) {
  return ref.watch(myClassStudentsProvider.future);
});

final diaryEntriesProvider =
    FutureProvider.autoDispose<List<DiaryEntry>>((ref) async {
  final studentId = ref.watch(diaryStudentIdProvider);
  if (studentId == null || studentId.isEmpty) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/diary',
    queryParameters: {'studentId': studentId},
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(DiaryEntry.fromJson)
      .toList();
});

class DiaryScreen extends ConsumerStatefulWidget {
  const DiaryScreen({super.key});

  @override
  ConsumerState<DiaryScreen> createState() => _DiaryScreenState();
}

class _DiaryScreenState extends ConsumerState<DiaryScreen> {
  final _body = TextEditingController();
  var _type = 'note';
  var _saving = false;
  String? _error;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final studentId = ref.read(diaryStudentIdProvider);
    final sectionIds =
        ref.read(sessionProvider).valueOrNull?.scopes.sectionIds ?? const [];
    if (studentId == null || _body.text.trim().isEmpty) {
      setState(() => _error = 'Pick a student and write a note.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(apiClientProvider).post<void>(
        '/diary',
        data: {
          'studentId': studentId,
          if (sectionIds.isNotEmpty) 'sectionId': sectionIds.first,
          'day': DateTime.now().toIso8601String().substring(0, 10),
          'entryType': _type,
          'body': _body.text.trim(),
        },
      );
      _body.clear();
      ref.invalidate(diaryEntriesProvider);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final students = ref.watch(diaryStudentsProvider);
    final selected = ref.watch(diaryStudentIdProvider);
    final entries = ref.watch(diaryEntriesProvider);

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Diary'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.s4),
        children: [
          students.when(
            loading: () => const Skeleton(height: 48, width: double.infinity),
            error: (_, __) => ErrorState(
              message: 'Could not load students.',
              onRetry: () => ref.invalidate(diaryStudentsProvider),
            ),
            data: (list) {
              if (list.isEmpty) {
                return EmptyState(
                  icon: PhosphorIconsRegular.bookOpen,
                  headline: 'No students',
                  body: 'Diary notes need a class roster.',
                );
              }
              // Auto-select first.
              if (selected == null) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  ref.read(diaryStudentIdProvider.notifier).state = list.first.id;
                });
              }
              return DropdownButtonFormField<String>(
                initialValue: selected ?? list.first.id,
                decoration: InputDecoration(
                  labelText: 'Student',
                  border: OutlineInputBorder(borderRadius: AppRadius.borderMd),
                ),
                items: [
                  for (final s in list)
                    DropdownMenuItem(value: s.id, child: Text(s.fullName)),
                ],
                onChanged: (v) =>
                    ref.read(diaryStudentIdProvider.notifier).state = v,
              );
            },
          ),
          const SizedBox(height: AppSpacing.s4),
          Wrap(
            spacing: AppSpacing.s2,
            children: [
              for (final type in const [
                'note',
                'appreciation',
                'concern',
                'reminder',
                'observation',
              ])
                InkWell(
                  onTap: () => setState(() => _type = type),
                  borderRadius: AppRadius.borderFull,
                  child: AppChip(
                    label: type,
                    tone: _type == type ? AppChipTone.info : AppChipTone.neutral,
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          AppTextField(
            label: 'Entry',
            controller: _body,
            maxLines: 5,
            minLines: 5,
            errorText: _error,
          ),
          const SizedBox(height: AppSpacing.s3),
          AppButton(
            label: 'Save diary entry',
            expanded: true,
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
          const SizedBox(height: AppSpacing.s6),
          Text('Recent', style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s2),
          entries.when(
            loading: () => const SkeletonList(count: 3),
            error: (_, __) => ErrorState(
              message: 'Could not load diary.',
              onRetry: () => ref.invalidate(diaryEntriesProvider),
            ),
            data: (items) {
              if (items.isEmpty) {
                return Text(
                  'No entries yet for this student.',
                  style: AppTypography.bodySmall(color: t.textTertiary),
                );
              }
              String? lastDay;
              return Column(
                children: [
                  for (final e in items) ...[
                    if (e.day != lastDay) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.s3),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            e.day,
                            style: AppTypography.overline(color: t.textTertiary),
                          ),
                        ),
                      ),
                      Builder(builder: (_) {
                        lastDay = e.day;
                        return const SizedBox.shrink();
                      }),
                    ],
                    AppListTile(
                      dense: true,
                      title: e.body,
                      subtitle: e.entryType,
                    ),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
