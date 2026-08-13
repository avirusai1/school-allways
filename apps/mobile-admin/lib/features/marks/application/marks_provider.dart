import 'dart:convert';

import 'package:core_auth/core_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/providers.dart';
import '../../students/presentation/my_class_screen.dart';

class MarksComponent {
  const MarksComponent({
    required this.id,
    required this.label,
    required this.maxMarks,
  });

  final String id;
  final String label;
  final int maxMarks;
}

/// Cell value: numeric marks, or null = empty, or -1 = absent ('A').
typedef MarksGrid = Map<String, Map<String, int?>>;

class MarksDraft {
  const MarksDraft({
    required this.sectionId,
    required this.examId,
    required this.subjectId,
    required this.marksSheetId,
    required this.assessmentLabel,
    required this.grid,
    required this.components,
  });

  final String sectionId;
  final String examId;
  final String subjectId;
  final String? marksSheetId;
  final String assessmentLabel;
  final MarksGrid grid;
  final List<MarksComponent> components;

  int get enteredCount {
    var n = 0;
    for (final row in grid.values) {
      if (row.values.any((v) => v != null)) n++;
    }
    return n;
  }

  MarksDraft copyWith({
    MarksGrid? grid,
    String? marksSheetId,
    List<MarksComponent>? components,
  }) =>
      MarksDraft(
        sectionId: sectionId,
        examId: examId,
        subjectId: subjectId,
        marksSheetId: marksSheetId ?? this.marksSheetId,
        assessmentLabel: assessmentLabel,
        grid: grid ?? this.grid,
        components: components ?? this.components,
      );

  Map<String, dynamic> toJson() => {
        'sectionId': sectionId,
        'examId': examId,
        'subjectId': subjectId,
        'marksSheetId': marksSheetId,
        'assessmentLabel': assessmentLabel,
        'grid': {
          for (final e in grid.entries)
            e.key: {
              for (final c in e.value.entries) c.key: c.value,
            },
        },
      };

  factory MarksDraft.fromJson(
    Map<String, dynamic> json, {
    required List<MarksComponent> components,
  }) {
    final raw = json['grid'] as Map<String, dynamic>? ?? const {};
    return MarksDraft(
      sectionId: json['sectionId'] as String? ?? '',
      examId: json['examId'] as String? ?? '',
      subjectId: json['subjectId'] as String? ?? '',
      marksSheetId: json['marksSheetId'] as String?,
      assessmentLabel: json['assessmentLabel'] as String? ?? 'Unit Test',
      components: components,
      grid: {
        for (final e in raw.entries)
          e.key: {
            for (final c in (e.value as Map<String, dynamic>).entries)
              c.key: c.value as int?,
          },
      },
    );
  }
}

final marksSectionIdProvider = StateProvider<String?>((ref) {
  final ids = ref.watch(sessionProvider).valueOrNull?.scopes.sectionIds;
  return ids != null && ids.isNotEmpty ? ids.first : null;
});

final marksSubjectIdProvider = StateProvider<String?>((ref) {
  final ids = ref.watch(sessionProvider).valueOrNull?.scopes.subjectIds;
  return ids != null && ids.isNotEmpty ? ids.first : null;
});

final marksExamIdProvider = FutureProvider.autoDispose<String?>((ref) async {
  final api = ref.watch(apiClientProvider);
  try {
    final res = await api.get<List<dynamic>>('/exams');
    final list = res.data ?? const [];
    if (list.isEmpty) return null;
    final first = list.first;
    if (first is Map<String, dynamic>) return first['id'] as String?;
    return null;
  } catch (_) {
    return null;
  }
});

final marksStudentsProvider =
    FutureProvider.autoDispose<List<StudentRow>>((ref) async {
  final sectionId = ref.watch(marksSectionIdProvider);
  if (sectionId == null) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/students',
    queryParameters: {'sectionId': sectionId, 'limit': 100},
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(StudentRow.fromJson)
      .toList();
});

class MarksDraftNotifier extends AutoDisposeAsyncNotifier<MarksDraft> {
  @override
  Future<MarksDraft> build() async {
    final sectionId = ref.watch(marksSectionIdProvider) ?? '';
    final subjectId = ref.watch(marksSubjectIdProvider) ?? '';
    final examId = await ref.watch(marksExamIdProvider.future) ?? '';
    final students = await ref.watch(marksStudentsProvider.future);
    final api = ref.watch(apiClientProvider);

    var components = const [
      MarksComponent(id: 'theory', label: 'Theory', maxMarks: 80),
      MarksComponent(id: 'practical', label: 'Practical', maxMarks: 20),
    ];
    String? marksSheetId;
    String assessmentLabel = 'Unit Test';
    MarksGrid grid = {
      for (final s in students)
        s.id: {for (final c in components) c.id: null},
    };

    if (examId.isNotEmpty && sectionId.isNotEmpty && subjectId.isNotEmpty) {
      try {
        final res = await api.get<Map<String, dynamic>>(
          '/exams/$examId/marks-sheet',
          queryParameters: {
            'sectionId': sectionId,
            'subjectId': subjectId,
          },
        );
        final data = res.data ?? const {};
        marksSheetId = data['marksSheetId'] as String?;
        final theoryMax = data['theoryMaxMarks'] as int? ?? data['maxMarks'] as int? ?? 80;
        final practicalMax = data['practicalMaxMarks'] as int? ?? 20;
        components = [
          MarksComponent(id: 'theory', label: 'Theory', maxMarks: theoryMax),
          MarksComponent(
            id: 'practical',
            label: 'Practical',
            maxMarks: practicalMax,
          ),
        ];
        final rows = data['students'] as List<dynamic>? ?? const [];
        for (final raw in rows.whereType<Map<String, dynamic>>()) {
          final sid = raw['studentId'] as String?;
          if (sid == null) continue;
          final entry = raw['entry'] as Map<String, dynamic>?;
          grid[sid] = {
            'theory': entry == null
                ? null
                : (entry['isAbsent'] == true
                    ? -1
                    : entry['theoryMarks'] as int?),
            'practical': entry == null
                ? null
                : (entry['isAbsent'] == true
                    ? null
                    : entry['practicalMarks'] as int?),
          };
        }
      } catch (_) {
        // Offline / no schedule yet — fall through to local draft.
      }
    }

    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('saw.marks.$sectionId.$subjectId');
    if (raw != null) {
      try {
        final draft = MarksDraft.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
          components: components,
        );
        final merged = Map<String, Map<String, int?>>.from(
          draft.grid.map((k, v) => MapEntry(k, Map<String, int?>.from(v))),
        );
        for (final s in students) {
          merged.putIfAbsent(
            s.id,
            () => {for (final c in components) c.id: null},
          );
        }
        return draft.copyWith(
          grid: merged,
          marksSheetId: marksSheetId ?? draft.marksSheetId,
          components: components,
        );
      } catch (_) {}
    }

    return MarksDraft(
      sectionId: sectionId,
      examId: examId,
      subjectId: subjectId,
      marksSheetId: marksSheetId,
      assessmentLabel: assessmentLabel,
      grid: grid,
      components: components,
    );
  }

  Future<void> setCell(String studentId, String componentId, int? value) async {
    final current = state.valueOrNull;
    if (current == null) return;
    final row = Map<String, int?>.from(current.grid[studentId] ?? {});
    row[componentId] = value;
    final grid = Map<String, Map<String, int?>>.from(current.grid);
    grid[studentId] = row;
    final next = current.copyWith(grid: grid);
    state = AsyncData(next);
    await _persist(next);
  }

  Future<void> _persist(MarksDraft draft) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'saw.marks.${draft.sectionId}.${draft.subjectId}',
      jsonEncode(draft.toJson()),
    );
  }

  Future<void> submitForModeration() async {
    final current = state.valueOrNull;
    if (current == null) return;
    if (current.examId.isEmpty || current.marksSheetId == null) {
      throw StateError('No exam/marks sheet available yet.');
    }

    final api = ref.read(apiClientProvider);
    final mutationId =
        DateTime.now().microsecondsSinceEpoch.toRadixString(16);
    final entries = <Map<String, dynamic>>[];
    for (final e in current.grid.entries) {
      final theory = e.value['theory'];
      final practical = e.value['practical'];
      if (theory == null && practical == null) continue;
      if (theory == -1) {
        entries.add({'studentId': e.key, 'isAbsent': true});
        continue;
      }
      entries.add({
        'studentId': e.key,
        if (theory != null) 'theoryMarks': theory,
        if (practical != null) 'practicalMarks': practical,
      });
    }

    await api.post<Map<String, dynamic>>(
      '/exams/${current.examId}/marks',
      data: {
        'marksSheetId': current.marksSheetId,
        'entries': entries,
        'clientMutationId': mutationId,
      },
    );

    await api.post<void>(
      '/exams/${current.examId}/marks/${current.marksSheetId}/submit',
    );

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'saw.marks.${current.sectionId}.${current.subjectId}.submitted',
      DateTime.now().toIso8601String(),
    );
  }
}

final marksDraftProvider =
    AsyncNotifierProvider.autoDispose<MarksDraftNotifier, MarksDraft>(
  MarksDraftNotifier.new,
);
