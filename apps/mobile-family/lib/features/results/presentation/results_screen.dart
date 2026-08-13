import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../../paywall/presentation/paywall_panel.dart';

class ExamResult {
  const ExamResult({
    required this.id,
    required this.examName,
    required this.obtainedMarks,
    required this.totalMarks,
    this.grade,
    this.percentageBp,
    this.subjects = const [],
    this.reportCardPath,
  });

  final String id;
  final String examName;
  final int obtainedMarks;
  final int totalMarks;
  final String? grade;
  final int? percentageBp;
  final List<SubjectMark> subjects;
  final String? reportCardPath;

  factory ExamResult.fromJson(Map<String, dynamic> json) {
    return ExamResult(
      id: json['id'] as String? ?? '',
      examName: json['examName'] as String? ?? 'Exam',
      obtainedMarks: json['obtainedMarks'] as int? ?? 0,
      totalMarks: json['totalMarks'] as int? ?? 0,
      grade: json['grade'] as String?,
      percentageBp: json['percentageBp'] as int?,
      reportCardPath: json['reportCardPath'] as String?,
      subjects: (json['subjects'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SubjectMark.fromJson)
          .toList(),
    );
  }

  double get percent =>
      percentageBp != null ? percentageBp! / 100.0 : (totalMarks == 0
          ? 0
          : (obtainedMarks / totalMarks) * 100);
}

class SubjectMark {
  const SubjectMark({
    required this.subjectId,
    required this.maxMarks,
    this.marksObtained,
    this.grade,
    this.isAbsent = false,
  });

  final String subjectId;
  final int maxMarks;
  final int? marksObtained;
  final String? grade;
  final bool isAbsent;

  factory SubjectMark.fromJson(Map<String, dynamic> json) {
    return SubjectMark(
      subjectId: json['subjectId'] as String? ?? '',
      maxMarks: json['maxMarks'] as int? ?? 0,
      marksObtained: json['marksObtained'] as int?,
      grade: json['grade'] as String?,
      isAbsent: json['isAbsent'] as bool? ?? false,
    );
  }
}

final resultsProvider =
    FutureProvider.autoDispose<List<ExamResult>>((ref) async {
  final studentId = ref.watch(childSwitcherProvider).valueOrNull;
  if (studentId == null || studentId.isEmpty) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/family/results',
    queryParameters: {'studentId': studentId},
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(ExamResult.fromJson)
      .toList();
});

class ResultsScreen extends ConsumerWidget {
  const ResultsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(resultsProvider);
    final t = context.tokens;

    return Column(
      children: [
        const SawAppBar(title: 'Results'),
        Expanded(
          child: async.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 4),
            ),
            error: (e, _) => GatedPaywallOrError(
              error: e,
              fallbackMessage: 'Could not load results.',
              onRetry: () => ref.invalidate(resultsProvider),
            ),
            data: (results) {
              if (results.isEmpty) {
                return const EmptyState(
                  icon: Icons.school_outlined,
                  headline: 'No results yet',
                  body: 'Published exam results will appear here.',
                );
              }
              return ListView(
                padding: const EdgeInsets.all(AppSpacing.s4),
                children: [
                  if (results.length >= 2) ...[
                    _TrendCard(results: results),
                    const SizedBox(height: AppSpacing.s4),
                  ],
                  for (final r in results)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.s3),
                      child: AppCard(
                      child: InkWell(
                        onTap: () => showAppBottomSheet(
                          context: context,
                          child: _ResultDetail(result: r),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(r.examName,
                                style: AppTypography.bodyMedium(
                                    color: t.textPrimary)),
                            const SizedBox(height: AppSpacing.s2),
                            Row(
                              children: [
                                Text(
                                  '${r.obtainedMarks}/${r.totalMarks}',
                                  style: AppTypography.numeric(
                                      color: t.textPrimary),
                                ),
                                const SizedBox(width: AppSpacing.s3),
                                if (r.grade != null)
                                  AppChip(label: r.grade!),
                                const Spacer(),
                                Text(
                                  '${r.percent.toStringAsFixed(1)}%',
                                  style: AppTypography.bodySmall(
                                      color: t.textTertiary),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _TrendCard extends StatelessWidget {
  const _TrendCard({required this.results});

  final List<ExamResult> results;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final points = results.reversed.map((r) => r.percent).toList();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Trend', style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          SizedBox(
            height: 80,
            width: double.infinity,
            child: CustomPaint(
              painter: _TrendPainter(points: points, color: t.primary),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter({required this.points, required this.color});

  final List<double> points;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final baseline = Paint()
      ..color = color.withValues(alpha: 0.15)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(0, size.height - 1),
      Offset(size.width, size.height - 1),
      baseline,
    );

    final max = points.reduce((a, b) => a > b ? a : b).clamp(1, 100);
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final x = points.length == 1
          ? size.width / 2
          : size.width * (i / (points.length - 1));
      final y = size.height - (points[i] / max) * (size.height - 8);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _TrendPainter oldDelegate) =>
      oldDelegate.points != points || oldDelegate.color != color;
}

class _ResultDetail extends StatelessWidget {
  const _ResultDetail({required this.result});

  final ExamResult result;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.s4,
        0,
        AppSpacing.s4,
        AppSpacing.s6,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(result.examName, style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s3),
          for (final s in result.subjects)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.s2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      s.subjectId,
                      style: AppTypography.body(color: t.textPrimary),
                    ),
                  ),
                  Text(
                    s.isAbsent
                        ? 'Absent'
                        : '${s.marksObtained ?? '—'}/${s.maxMarks}',
                    style: AppTypography.numeric(color: t.textPrimary),
                  ),
                  if (s.grade != null) ...[
                    const SizedBox(width: AppSpacing.s2),
                    AppChip(label: s.grade!),
                  ],
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.s3),
          Row(
            children: [
              Expanded(
                child: Text('Total',
                    style: AppTypography.bodyMedium(color: t.textPrimary)),
              ),
              Text(
                '${result.obtainedMarks}/${result.totalMarks}',
                style: AppTypography.numeric(color: t.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.s4),
          AppButton(
            label: 'Download report card',
            expanded: true,
            variant: AppButtonVariant.secondary,
            onPressed: result.reportCardPath == null ? null : () {},
          ),
        ],
      ),
    );
  }
}
