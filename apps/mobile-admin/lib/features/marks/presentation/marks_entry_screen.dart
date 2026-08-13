import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../application/marks_provider.dart';

/// Spreadsheet marks entry — keyboard Next moves down the column.
class MarksEntryScreen extends ConsumerStatefulWidget {
  const MarksEntryScreen({super.key});

  @override
  ConsumerState<MarksEntryScreen> createState() => _MarksEntryScreenState();
}

class _MarksEntryScreenState extends ConsumerState<MarksEntryScreen> {
  /// Focus nodes: [studentIndex][componentIndex]
  List<List<FocusNode>> _nodes = const [];
  List<List<TextEditingController>> _controllers = const [];
  var _seeded = false;
  String? _submitMsg;

  @override
  void dispose() {
    _disposeEditors();
    super.dispose();
  }

  void _disposeEditors() {
    for (final row in _nodes) {
      for (final n in row) {
        n.dispose();
      }
    }
    for (final row in _controllers) {
      for (final c in row) {
        c.dispose();
      }
    }
  }

  void _ensureEditors(int studentCount, int componentCount) {
    if (_seeded &&
        _nodes.length == studentCount &&
        (_nodes.isEmpty || _nodes.first.length == componentCount)) {
      return;
    }
    _disposeEditors();
    _nodes = List.generate(
      studentCount,
      (_) => List.generate(componentCount, (_) => FocusNode()),
    );
    _controllers = List.generate(
      studentCount,
      (_) => List.generate(componentCount, (_) => TextEditingController()),
    );
    _seeded = true;
  }

  void _moveDown(int studentIndex, int componentIndex, int studentCount) {
    final next = studentIndex + 1;
    if (next < studentCount) {
      _nodes[next][componentIndex].requestFocus();
    } else {
      FocusScope.of(context).unfocus();
    }
  }

  Future<void> _onChanged({
    required String studentId,
    required MarksComponent component,
    required String raw,
  }) async {
    if (raw.toUpperCase() == 'A') {
      await ref
          .read(marksDraftProvider.notifier)
          .setCell(studentId, component.id, -1);
      return;
    }
    if (raw.isEmpty) {
      await ref
          .read(marksDraftProvider.notifier)
          .setCell(studentId, component.id, null);
      return;
    }
    final n = int.tryParse(raw);
    if (n == null) return;
    final clamped = n.clamp(0, component.maxMarks);
    await ref
        .read(marksDraftProvider.notifier)
        .setCell(studentId, component.id, clamped);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final studentsAsync = ref.watch(marksStudentsProvider);
    final draftAsync = ref.watch(marksDraftProvider);

    return Column(
      children: [
        const SawAppBar(title: 'Marks entry'),
        Expanded(
          child: studentsAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 8, rowHeight: 44),
            ),
            error: (_, __) => Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: ErrorState(
                message: 'Could not load students for marks.',
                onRetry: () => ref.invalidate(marksStudentsProvider),
              ),
            ),
            data: (students) {
              if (students.isEmpty) {
                return EmptyState(
                  icon: PhosphorIconsRegular.exam,
                  headline: 'No students',
                  body: 'Assign a section to enter marks.',
                );
              }
              return draftAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => ErrorState(
                  message: 'Could not load marks draft.',
                  onRetry: () => ref.invalidate(marksDraftProvider),
                ),
                data: (draft) {
                  final components = draft.components;
                  _ensureEditors(students.length, components.length);
                  // Sync controller text once when draft loads / changes lightly.
                  for (var i = 0; i < students.length; i++) {
                    final row = draft.grid[students[i].id] ?? const {};
                    for (var j = 0; j < components.length; j++) {
                      final v = row[components[j].id];
                      final text = v == null
                          ? ''
                          : v < 0
                              ? 'A'
                              : '$v';
                      if (_controllers[i][j].text != text &&
                          !_nodes[i][j].hasFocus) {
                        _controllers[i][j].text = text;
                      }
                    }
                  }

                  final entered = draft.enteredCount;
                  final total = students.length;
                  final progress = total == 0 ? 0.0 : entered / total;

                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.s4,
                          AppSpacing.s3,
                          AppSpacing.s4,
                          AppSpacing.s2,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              draft.assessmentLabel,
                              style: AppTypography.h3(color: t.textPrimary),
                            ),
                            const SizedBox(height: AppSpacing.s1),
                            Text(
                              '$entered of $total entered',
                              style: AppTypography.caption(color: t.textTertiary),
                            ),
                            const SizedBox(height: AppSpacing.s2),
                            ClipRRect(
                              borderRadius: AppRadius.borderFull,
                              child: LinearProgressIndicator(
                                value: progress,
                                minHeight: 6,
                                backgroundColor: t.disabledFill,
                                color: t.primary,
                              ),
                            ),
                            if (_submitMsg != null) ...[
                              const SizedBox(height: AppSpacing.s2),
                              Text(
                                _submitMsg!,
                                style: AppTypography.caption(
                                  color: t.successText,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      Expanded(
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: SizedBox(
                            width: 140 + (components.length * 64),
                            child: ListView.builder(
                              itemCount: students.length + 1,
                              itemBuilder: (context, index) {
                                if (index == 0) {
                                  return _HeaderRow(
                                    tokens: t,
                                    components: components,
                                  );
                                }
                                final si = index - 1;
                                final student = students[si];
                                return _StudentRow(
                                  roll: student.rollNo ?? '${si + 1}',
                                  name: student.fullName,
                                  tokens: t,
                                  cells: [
                                    for (var j = 0;
                                        j < components.length;
                                        j++)
                                      _MarksCell(
                                        controller: _controllers[si][j],
                                        focusNode: _nodes[si][j],
                                        component: components[j],
                                        value: draft.grid[student.id]
                                            ?[components[j].id],
                                        onChanged: (raw) => _onChanged(
                                          studentId: student.id,
                                          component: components[j],
                                          raw: raw,
                                        ),
                                        onNext: () => _moveDown(
                                          si,
                                          j,
                                          students.length,
                                        ),
                                        onAbsent: () async {
                                          _controllers[si][j].text = 'A';
                                          await ref
                                              .read(
                                                marksDraftProvider.notifier,
                                              )
                                              .setCell(
                                                student.id,
                                                components[j].id,
                                                -1,
                                              );
                                        },
                                      ),
                                  ],
                                );
                              },
                            ),
                          ),
                        ),
                      ),
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.s3),
                          child: AppButton(
                            label: 'Submit for moderation',
                            expanded: true,
                            onPressed: entered < total
                                ? null
                                : () async {
                                    try {
                                      await ref
                                          .read(marksDraftProvider.notifier)
                                          .submitForModeration();
                                      setState(
                                        () => _submitMsg =
                                            'Submitted for moderation',
                                      );
                                    } catch (e) {
                                      setState(
                                        () => _submitMsg =
                                            'Could not submit: $e',
                                      );
                                    }
                                  },
                          ),
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
    );
  }
}

class _HeaderRow extends StatelessWidget {
  const _HeaderRow({required this.tokens, required this.components});

  final AppThemeExtension tokens;
  final List<MarksComponent> components;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      color: tokens.surfaceAlt,
      child: Row(
        children: [
          const SizedBox(
            width: 140,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.s3),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Student'),
              ),
            ),
          ),
          for (final c in components)
            SizedBox(
              width: 64,
              child: Center(
                child: Text(
                  c.label,
                  style: AppTypography.caption(color: tokens.textTertiary),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    required this.roll,
    required this.name,
    required this.tokens,
    required this.cells,
  });

  final String roll;
  final String name;
  final AppThemeExtension tokens;
  final List<Widget> cells;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: tokens.border)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 140,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.s2),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$roll  $name',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodySmall(color: tokens.textPrimary),
                  ),
                ],
              ),
            ),
          ),
          ...cells,
        ],
      ),
    );
  }
}

class _MarksCell extends StatelessWidget {
  const _MarksCell({
    required this.controller,
    required this.focusNode,
    required this.component,
    required this.value,
    required this.onChanged,
    required this.onNext,
    required this.onAbsent,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final MarksComponent component;
  final int? value;
  final ValueChanged<String> onChanged;
  final VoidCallback onNext;
  final VoidCallback onAbsent;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final invalid = value != null && value! > component.maxMarks;
    return SizedBox(
      width: 64,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: GestureDetector(
          onLongPress: onAbsent,
          child: TextField(
            controller: controller,
            focusNode: focusNode,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            textAlign: TextAlign.center,
            style: AppTypography.numeric(color: t.textPrimary),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9Aa]')),
              LengthLimitingTextInputFormatter(3),
            ],
            decoration: InputDecoration(
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(vertical: 8),
              hintText: '${component.maxMarks}',
              hintStyle: AppTypography.caption(color: t.placeholder),
              filled: true,
              fillColor: t.surface,
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadius.borderSm,
                borderSide: BorderSide(
                  color: invalid ? t.danger : t.border,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: AppRadius.borderSm,
                borderSide: BorderSide(
                  color: invalid ? t.danger : t.primary,
                  width: 2,
                ),
              ),
            ),
            onChanged: onChanged,
            onEditingComplete: onNext,
            onSubmitted: (_) => onNext(),
          ),
        ),
      ),
    );
  }
}
