import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/routes.dart';

/// High-contrast theme for gate screens (sunlight + shared low-end phone).
ThemeData gateHighContrastTheme() {
  const bg = Color(0xFF16202B);
  const surface = Color(0xFF1A1F26);
  const surfaceAlt = Color(0xFF242B33);
  const text = Color(0xFFFFFFFF);
  const muted = Color(0xFFB0B8C1);
  const border = Color(0xFF3D4651);
  final dark = AppThemeExtension.fromPrimary(const Color(0xFF1B5E9C)).copyWith(
    appBackground: bg,
    surface: surface,
    surfaceAlt: surfaceAlt,
    textPrimary: text,
    textSecondary: muted,
    textTertiary: muted,
    border: border,
    borderStrong: muted,
  );
  return AppTheme.build(const Color(0xFF1B5E9C)).copyWith(
    scaffoldBackgroundColor: bg,
    extensions: <ThemeExtension<dynamic>>[
      dark,
      const AppDensityExtension(density: AppDensity.comfortable),
    ],
  );
}

class GateScannerScreen extends StatelessWidget {
  const GateScannerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: gateHighContrastTheme(),
      child: Builder(
        builder: (context) {
          final t = context.tokens;
          return Scaffold(
            backgroundColor: t.appBackground,
            appBar: SawAppBar(
              title: 'Gate scanner',
              actions: [
                IconButton(
                  icon: Icon(PhosphorIconsRegular.gear, color: t.textPrimary),
                  onPressed: () => context.push(AdminRoutes.settings),
                ),
              ],
            ),
            body: Column(
              children: [
                Expanded(
                  flex: 6,
                  child: Container(
                    width: double.infinity,
                    color: t.surfaceAlt,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Icon(
                          PhosphorIconsRegular.qrCode,
                          size: 96,
                          color: t.textTertiary,
                        ),
                        Container(
                          width: 220,
                          height: 220,
                          decoration: BoxDecoration(
                            border: Border.all(color: t.accent, width: 3),
                            borderRadius: AppRadius.borderMd,
                          ),
                        ),
                        Positioned(
                          bottom: AppSpacing.s4,
                          child: Text(
                            'Align QR inside the frame',
                            style: AppTypography.bodyMedium(
                              color: t.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  flex: 4,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.s4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(
                          height: 64,
                          child: AppButton(
                            label: 'Verify pickup code',
                            expanded: true,
                            onPressed: () =>
                                context.push(AdminRoutes.verifyPickup),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.s3),
                        SizedBox(
                          height: 64,
                          child: AppButton(
                            label: 'Enter code manually',
                            variant: AppButtonVariant.outline,
                            expanded: true,
                            onPressed: () =>
                                context.push(AdminRoutes.verifyPickup),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class VerifyPickupScreen extends ConsumerStatefulWidget {
  const VerifyPickupScreen({super.key});

  @override
  ConsumerState<VerifyPickupScreen> createState() => _VerifyPickupScreenState();
}

class _VerifyPickupScreenState extends ConsumerState<VerifyPickupScreen> {
  final _code = TextEditingController();
  var _loading = false;
  var _denied = false;
  String? _error;
  _PickupVerifyResult? _result;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final otp = _code.text.trim();
    if (otp.length < 6) return;
    setState(() {
      _loading = true;
      _error = null;
      _denied = false;
      _result = null;
    });
    HapticFeedback.mediumImpact();
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.post<Map<String, dynamic>>(
        '/pickup/verify',
        data: {'otp': otp},
      );
      final data = res.data ?? const <String, dynamic>{};
      final authorised = data['authorised'] == true;
      if (!authorised) {
        setState(() {
          _denied = true;
          _error = data['reason'] as String? ?? 'Not authorised';
          _loading = false;
        });
        return;
      }
      setState(() {
        _result = _PickupVerifyResult.fromJson(data);
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not verify. Check network and try again.';
        _loading = false;
      });
    }
  }

  Future<void> _release({bool override = false, String? reason}) async {
    final result = _result;
    if (result == null) return;
    setState(() => _loading = true);
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/pickup/handover',
        data: {
          'studentId': result.studentId,
          'method': 'authorised_person',
          'authorisedPickupId': result.personId,
          'verificationMethod': override ? 'manual_override' : 'otp',
          if (override) 'overrideReason': reason,
        },
      );
      HapticFeedback.heavyImpact();
      if (mounted) context.pop();
    } catch (_) {
      setState(() {
        _error = override
            ? 'Override failed. Ensure you have override permission.'
            : 'Handover failed. Try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: gateHighContrastTheme(),
      child: Builder(
        builder: (context) {
          final t = context.tokens;
          final result = _result;
          return Scaffold(
            backgroundColor: t.appBackground,
            appBar: const SawAppBar(title: 'Verify pickup'),
            body: ListView(
              padding: const EdgeInsets.all(AppSpacing.s4),
              children: [
                if (result == null) ...[
                  AppTextField(
                    label: '6-digit code',
                    controller: _code,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  SizedBox(
                    height: 64,
                    child: AppButton(
                      label: _loading ? 'Looking up…' : 'Look up',
                      expanded: true,
                      onPressed: _loading ? null : _lookup,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: AppSpacing.s3),
                    Text(
                      _error!,
                      style: AppTypography.bodySmall(color: t.danger),
                    ),
                  ],
                ] else ...[
                  Center(
                    child: Column(
                      children: [
                        Container(
                          width: 200,
                          height: 200,
                          decoration: BoxDecoration(
                            color: t.surfaceAlt,
                            borderRadius: AppRadius.borderMd,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: result.personPhotoUrl != null
                              ? Image.network(
                                  result.personPhotoUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Icon(
                                    PhosphorIconsRegular.user,
                                    size: 96,
                                    color: t.textTertiary,
                                  ),
                                )
                              : Icon(
                                  PhosphorIconsRegular.user,
                                  size: 96,
                                  color: t.textTertiary,
                                ),
                        ),
                        const SizedBox(height: AppSpacing.s4),
                        Text(
                          result.personName,
                          style: AppTypography.h2(color: t.textPrimary),
                        ),
                        Text(
                          [
                            if (result.relation != null) result.relation!,
                            if (result.idLast4 != null)
                              'ID …${result.idLast4}',
                          ].join(' · '),
                          style: AppTypography.body(color: t.textSecondary),
                        ),
                        const SizedBox(height: AppSpacing.s3),
                        Text(
                          'Child: ${result.studentName}'
                          '${result.studentClass != null ? ' · ${result.studentClass}' : ''}',
                          style: AppTypography.bodyMedium(color: t.textPrimary),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.s6),
                  SizedBox(
                    height: 64,
                    child: AppButton(
                      label: '✓ Release child',
                      expanded: true,
                      onPressed: _loading ? null : () => _release(),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.s3),
                  SizedBox(
                    height: 64,
                    child: AppButton(
                      label: '✕ Deny',
                      variant: AppButtonVariant.danger,
                      expanded: true,
                      onPressed: () => setState(() => _denied = true),
                    ),
                  ),
                  if (_denied) ...[
                    const SizedBox(height: AppSpacing.s3),
                    Text(
                      'Denied. Override alerts the principal and needs a reason.',
                      style: AppTypography.bodySmall(color: t.danger),
                    ),
                    AppButton(
                      label: 'Manual override (reason required)',
                      variant: AppButtonVariant.ghost,
                      onPressed: () async {
                        final reason = TextEditingController();
                        final ok = await showAppBottomSheet<bool>(
                          context: context,
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.s4),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'The principal will be notified.',
                                  style: AppTypography.body(
                                    color: t.warningText,
                                  ),
                                ),
                                const SizedBox(height: AppSpacing.s3),
                                AppTextField(
                                  label: 'Reason (min 20 characters)',
                                  controller: reason,
                                ),
                                const SizedBox(height: AppSpacing.s3),
                                AppButton(
                                  label: 'Confirm override',
                                  expanded: true,
                                  onPressed: () {
                                    if (reason.text.trim().length < 20) return;
                                    Navigator.pop(context, true);
                                  },
                                ),
                              ],
                            ),
                          ),
                        );
                        final text = reason.text.trim();
                        reason.dispose();
                        if (ok == true && text.length >= 20 && mounted) {
                          await _release(override: true, reason: text);
                        }
                      },
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: AppSpacing.s3),
                    Text(
                      _error!,
                      style: AppTypography.bodySmall(color: t.danger),
                    ),
                  ],
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PickupVerifyResult {
  const _PickupVerifyResult({
    required this.personId,
    required this.personName,
    required this.studentId,
    required this.studentName,
    this.relation,
    this.idLast4,
    this.personPhotoUrl,
    this.studentClass,
  });

  final String personId;
  final String personName;
  final String studentId;
  final String studentName;
  final String? relation;
  final String? idLast4;
  final String? personPhotoUrl;
  final String? studentClass;

  factory _PickupVerifyResult.fromJson(Map<String, dynamic> json) {
    final person = (json['person'] as Map<String, dynamic>?) ?? const {};
    final student = (json['student'] as Map<String, dynamic>?) ?? const {};
    return _PickupVerifyResult(
      personId: person['id'] as String? ?? '',
      personName: person['name'] as String? ?? 'Authorised person',
      relation: person['relation'] as String?,
      idLast4: person['idLast4'] as String?,
      personPhotoUrl: person['photoUrl'] as String?,
      studentId: student['id'] as String? ?? '',
      studentName: student['name'] as String? ?? 'Student',
      studentClass: student['class'] as String?,
    );
  }
}
