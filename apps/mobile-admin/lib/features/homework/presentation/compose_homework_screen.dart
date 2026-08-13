import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers.dart';
import 'teacher_homework_screen.dart';

class ComposeHomeworkScreen extends ConsumerStatefulWidget {
  const ComposeHomeworkScreen({super.key});

  @override
  ConsumerState<ComposeHomeworkScreen> createState() =>
      _ComposeHomeworkScreenState();
}

class _ComposeHomeworkScreenState extends ConsumerState<ComposeHomeworkScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  var _requiresSubmission = false;
  var _saving = false;
  String? _error;
  String? _dueOn;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final sectionIds =
        ref.read(sessionProvider).valueOrNull?.scopes.sectionIds ?? const [];
    if (sectionIds.isEmpty) {
      setState(() => _error = 'No section assigned to post homework.');
      return;
    }
    if (_title.text.trim().isEmpty) {
      setState(() => _error = 'Title is required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      await ref.read(apiClientProvider).post<void>(
        '/homework',
        data: {
          'sectionId': sectionIds.first,
          'title': _title.text.trim(),
          'description': _description.text.trim().isEmpty
              ? null
              : _description.text.trim(),
          'assignedOn': today,
          if (_dueOn != null) 'dueOn': _dueOn,
          'requiresSubmission': _requiresSubmission,
        },
      );
      ref.invalidate(teacherHomeworkProvider);
      if (mounted) context.pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDue() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 120)),
    );
    if (picked != null) {
      setState(() => _dueOn = picked.toIso8601String().substring(0, 10));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final sectionIds =
        ref.watch(sessionProvider).valueOrNull?.scopes.sectionIds ?? const [];

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Post homework'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.s4),
        children: [
          Text(
            sectionIds.isEmpty
                ? 'Section: not assigned'
                : 'Section: ${sectionIds.first.substring(0, 8)}…',
            style: AppTypography.bodySmall(color: t.textTertiary),
          ),
          const SizedBox(height: AppSpacing.s4),
          AppTextField(
            label: 'Title',
            controller: _title,
            errorText: _error,
          ),
          const SizedBox(height: AppSpacing.s4),
          AppTextField(
            label: 'Description',
            controller: _description,
            maxLines: 5,
            minLines: 5,
          ),
          const SizedBox(height: AppSpacing.s4),
          AppListTile(
            title: 'Due date',
            subtitle: _dueOn ?? 'Optional',
            showChevron: true,
            onTap: _pickDue,
          ),
          SwitchListTile(
            title: Text(
              'Requires submission',
              style: AppTypography.body(color: t.textPrimary),
            ),
            value: _requiresSubmission,
            activeThumbColor: t.primary,
            onChanged: (v) => setState(() => _requiresSubmission = v),
          ),
          const SizedBox(height: AppSpacing.s4),
          AppButton(
            label: 'Publish homework',
            expanded: true,
            loading: _saving,
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
    );
  }
}
