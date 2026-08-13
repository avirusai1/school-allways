import 'dart:math';

import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../core/sync_chrome.dart';

/// Collect fee — focused counter flow (build/14 §16).
class CollectFeeScreen extends ConsumerStatefulWidget {
  const CollectFeeScreen({super.key, this.prefillStudentId});

  final String? prefillStudentId;

  @override
  ConsumerState<CollectFeeScreen> createState() => _CollectFeeScreenState();
}

class _CollectFeeScreenState extends ConsumerState<CollectFeeScreen> {
  final _search = TextEditingController();
  var _query = '';
  List<_StudentHit> _hits = const [];
  _StudentHit? _student;
  List<_InvoiceHit> _invoices = const [];
  final _selected = <String>{};
  var _mode = 'cash';
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  var _loading = false;
  String? _error;
  Map<String, dynamic>? _receipt;

  @override
  void dispose() {
    _search.dispose();
    _amount.dispose();
    _reference.dispose();
    super.dispose();
  }

  Future<void> _searchStudents(String q) async {
    setState(() {
      _query = q.trim();
      _error = null;
    });
    if (_query.length < 2) {
      setState(() => _hits = const []);
      return;
    }
    try {
      final res = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
        '/students',
        queryParameters: {'q': _query, 'limit': 20},
      );
      final data = res.data?['data'] as List<dynamic>? ?? const [];
      setState(() {
        _hits = data
            .whereType<Map<String, dynamic>>()
            .map(_StudentHit.fromJson)
            .toList();
        ref.read(offlineBannerProvider.notifier).state = false;
      });
    } catch (_) {
      ref.read(offlineBannerProvider.notifier).state = true;
      setState(() => _hits = const []);
    }
  }

  Future<void> _selectStudent(_StudentHit s) async {
    setState(() {
      _student = s;
      _hits = const [];
      _search.text = s.fullName;
      _loading = true;
      _invoices = const [];
      _selected.clear();
      _receipt = null;
    });
    try {
      final res = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
        '/fees/status',
        queryParameters: {'studentId': s.id},
      );
      // Prefer invoice list from defaulters-shaped payload or family-like overview.
      final invoices = (res.data?['invoices'] as List<dynamic>? ??
              res.data?['data'] as List<dynamic>? ??
              const [])
          .whereType<Map<String, dynamic>>()
          .map(_InvoiceHit.fromJson)
          .where((i) => i.balancePaise > 0)
          .toList();

      if (invoices.isEmpty) {
        final def = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
          '/fees/defaulters',
          queryParameters: {'studentId': s.id},
        );
        final list = (def.data?['data'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .where((e) => e['studentId'] == s.id)
            .map(_InvoiceHit.fromDefaulter)
            .toList();
        setState(() {
          _invoices = list;
          _selected.addAll(list.map((e) => e.id));
          _amount.text = _formatPaise(_selectedTotal);
        });
      } else {
        setState(() {
          _invoices = invoices;
          _selected.addAll(invoices.map((e) => e.id));
          _amount.text = _formatPaise(_selectedTotal);
        });
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int get _selectedTotal => _invoices
      .where((i) => _selected.contains(i.id))
      .fold(0, (s, i) => s + i.balancePaise);

  String _formatPaise(int paise) => (paise / 100).toStringAsFixed(0);

  int _parseAmountPaise() {
    final raw = _amount.text.replaceAll(',', '').trim();
    final rupees = double.tryParse(raw) ?? 0;
    return (rupees * 100).round();
  }

  Future<void> _collect() async {
    final student = _student;
    if (student == null || _selected.isEmpty) return;
    final amount = _parseAmountPaise();
    if (amount <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final allocs = <Map<String, dynamic>>[];
      var remaining = amount;
      for (final inv in _invoices.where((i) => _selected.contains(i.id))) {
        if (remaining <= 0) break;
        final take = remaining < inv.balancePaise ? remaining : inv.balancePaise;
        allocs.add({'invoiceId': inv.id, 'amountPaise': take});
        remaining -= take;
      }

      final res = await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/fees/payments',
        data: {
          'studentId': student.id,
          'paymentDate': DateTime.now().toIso8601String().substring(0, 10),
          'amountPaise': amount,
          'mode': _mode,
          'allocations': allocs,
          if (_reference.text.trim().isNotEmpty)
            'referenceNo': _reference.text.trim(),
          'clientMutationId': _mutationId(),
        },
      );
      setState(() => _receipt = res.data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _mutationId() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int b) => b.toRadixString(16).padLeft(2, '0');
    final h = bytes.map(hex).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
        '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    if (_receipt != null) {
      return AppScaffold(
        appBar: const SawAppBar(title: 'Receipt'),
        body: Padding(
          padding: const EdgeInsets.all(AppSpacing.s4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(PhosphorIconsRegular.checkCircle, size: 48, color: t.success),
              const SizedBox(height: AppSpacing.s3),
              Text(
                'Payment collected',
                style: AppTypography.h3(color: t.textPrimary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.s2),
              Text(
                'Receipt ${_receipt!['receiptNo'] ?? _receipt!['id'] ?? ''}',
                textAlign: TextAlign.center,
                style: AppTypography.body(color: t.textSecondary),
              ),
              const SizedBox(height: AppSpacing.s2),
              Center(
                child: MoneyText(
                  paise: _receipt!['amountPaise'] as int? ?? _parseAmountPaise(),
                  large: true,
                  showPaise: false,
                ),
              ),
              const Spacer(),
              AppButton(
                label: 'New collection',
                expanded: true,
                onPressed: () {
                  setState(() {
                    _receipt = null;
                    _student = null;
                    _invoices = const [];
                    _selected.clear();
                    _search.clear();
                    _amount.clear();
                  });
                },
              ),
              const SizedBox(height: AppSpacing.s2),
              AppButton(
                label: 'Back to fee counter',
                expanded: true,
                variant: AppButtonVariant.ghost,
                onPressed: () => context.pop(),
              ),
            ],
          ),
        ),
      );
    }

    return AppScaffold(
      appBar: const SawAppBar(title: 'Collect fee'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.s4),
        children: [
          AppTextField(
            controller: _search,
            label: 'Search student',
            hint: 'Name / admission no / phone',
            onChanged: _searchStudents,
          ),
          if (_hits.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.s2),
            for (final h in _hits)
              AppListTile(
                dense: true,
                title: h.fullName,
                subtitle: h.admissionNo,
                onTap: () => _selectStudent(h),
              ),
          ],
          if (_student != null) ...[
            const SizedBox(height: AppSpacing.s4),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_student!.fullName,
                      style: AppTypography.h3(color: t.textPrimary)),
                  if (_student!.admissionNo != null)
                    Text(
                      'Adm ${_student!.admissionNo}',
                      style: AppTypography.bodySmall(color: t.textTertiary),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.s3),
            if (_loading)
              const SkeletonList(count: 3, rowHeight: 44)
            else if (_invoices.isEmpty)
              const EmptyState(
                icon: Icons.currency_rupee,
                headline: 'Nothing due',
                body: 'This student has no outstanding invoices.',
              )
            else ...[
              for (final inv in _invoices)
                CheckboxListTile(
                  value: _selected.contains(inv.id),
                  dense: true,
                  title: Text(inv.label),
                  subtitle: Text(inv.dueDate),
                  secondary: MoneyText(
                    paise: inv.balancePaise,
                    showPaise: false,
                  ),
                  onChanged: (v) {
                    setState(() {
                      if (v == true) {
                        _selected.add(inv.id);
                      } else {
                        _selected.remove(inv.id);
                      }
                      _amount.text = _formatPaise(_selectedTotal);
                    });
                  },
                ),
              const SizedBox(height: AppSpacing.s3),
              AppTextField(
                controller: _amount,
                label: 'Amount (₹)',
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: AppSpacing.s3),
              Text('Mode', style: AppTypography.label(color: t.textSecondary)),
              const SizedBox(height: AppSpacing.s2),
              Wrap(
                spacing: AppSpacing.s2,
                children: [
                  for (final m in const [
                    'cash',
                    'upi',
                    'cheque',
                    'dd',
                    'card',
                  ])
                    ChoiceChip(
                      label: Text(m.toUpperCase()),
                      selected: _mode == m,
                      onSelected: (_) => setState(() => _mode = m),
                    ),
                ],
              ),
              if (_mode == 'cheque' || _mode == 'dd' || _mode == 'upi') ...[
                const SizedBox(height: AppSpacing.s3),
                AppTextField(
                  controller: _reference,
                  label: _mode == 'upi' ? 'UPI reference' : 'Instrument no',
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.s2),
                Text(_error!,
                    style: AppTypography.bodySmall(color: t.dangerText)),
              ],
              const SizedBox(height: AppSpacing.s4),
              AppButton(
                label: 'Collect ₹${_amount.text.isEmpty ? '0' : _amount.text}',
                expanded: true,
                loading: _loading,
                onPressed: _loading || _selected.isEmpty ? null : _collect,
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _StudentHit {
  const _StudentHit({
    required this.id,
    required this.fullName,
    this.admissionNo,
  });

  final String id;
  final String fullName;
  final String? admissionNo;

  factory _StudentHit.fromJson(Map<String, dynamic> json) {
    return _StudentHit(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ??
          [json['firstName'], json['lastName']].whereType<String>().join(' '),
      admissionNo: json['admissionNo'] as String?,
    );
  }
}

class _InvoiceHit {
  const _InvoiceHit({
    required this.id,
    required this.label,
    required this.dueDate,
    required this.balancePaise,
  });

  final String id;
  final String label;
  final String dueDate;
  final int balancePaise;

  factory _InvoiceHit.fromJson(Map<String, dynamic> json) {
    return _InvoiceHit(
      id: json['id'] as String? ?? json['invoiceId'] as String? ?? '',
      label: json['invoiceNo'] as String? ??
          json['termName'] as String? ??
          'Invoice',
      dueDate: json['dueDate'] as String? ?? '',
      balancePaise: json['balancePaise'] as int? ??
          json['amountDuePaise'] as int? ??
          0,
    );
  }

  factory _InvoiceHit.fromDefaulter(Map<String, dynamic> json) {
    return _InvoiceHit(
      id: json['invoiceId'] as String? ?? json['id'] as String? ?? '',
      label: json['invoiceNo'] as String? ?? 'Invoice',
      dueDate: json['dueDate'] as String? ?? '',
      balancePaise: json['balancePaise'] as int? ?? 0,
    );
  }
}
