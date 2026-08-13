import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router/routes.dart';
import '../application/login_flow_provider.dart';

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  static const _length = 6;
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _nodes;
  var _loading = false;
  String? _error;
  var _secondsLeft = 0;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(_length, (_) => TextEditingController());
    _nodes = List.generate(_length, (_) => FocusNode());
    _secondsLeft = ref.read(loginFlowProvider).resendAfterSeconds;
    _tick();
  }

  void _tick() {
    Future<void>.delayed(const Duration(seconds: 1), () {
      if (!mounted || _secondsLeft <= 0) return;
      setState(() => _secondsLeft -= 1);
      _tick();
    });
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final n in _nodes) {
      n.dispose();
    }
    super.dispose();
  }

  String get _code => _controllers.map((c) => c.text).join();

  Future<void> _afterTokens(AuthTokensResult result) async {
    ref.read(loginFlowProvider.notifier).setTenants(result.tenants);
    if (!mounted) return;
    if (result.requiresTenantSelection || result.tenants.length > 1) {
      context.go(AdminRoutes.selectSchool);
      return;
    }
    if (result.tenants.length == 1) {
      await ref.read(authRepositoryProvider).selectTenant(result.tenants.first.id);
    }
    final session = await ref.read(authRepositoryProvider).fetchSession();
    await ref.read(sessionProvider.notifier).setSession(session);
    if (!mounted) return;
    context.go(AdminRoutes.home);
  }

  Future<void> _submit() async {
    final code = _code;
    if (code.length != _length) return;
    final phone = ref.read(loginFlowProvider).phone;
    if (phone.isEmpty) {
      context.go(AdminRoutes.login);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result =
          await ref.read(authRepositoryProvider).verifyOtp(phone, code);
      await _afterTokens(result);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Invalid OTP. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    if (_secondsLeft > 0) return;
    final phone = ref.read(loginFlowProvider).phone;
    try {
      final result = await ref.read(authRepositoryProvider).requestOtp(phone);
      ref.read(loginFlowProvider.notifier).setOtpMeta(
            resendAfterSeconds: result.resendAfterSeconds,
            devOtp: result.devOtp,
          );
      setState(() {
        _secondsLeft = result.resendAfterSeconds;
        _error = null;
      });
      _tick();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  void _onChanged(int index, String value) {
    if (value.length > 1) {
      final digits = value.replaceAll(RegExp(r'\D'), '');
      for (var i = 0; i < _length; i++) {
        _controllers[i].text = i < digits.length ? digits[i] : '';
      }
      if (digits.length >= _length) _submit();
      return;
    }
    if (value.isNotEmpty && index < _length - 1) {
      _nodes[index + 1].requestFocus();
    }
    if (value.isEmpty && index > 0) {
      _nodes[index - 1].requestFocus();
    }
    if (_code.length == _length) _submit();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final flow = ref.watch(loginFlowProvider);
    final hasError = _error != null;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Enter OTP'),
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.s6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'We sent a 6-digit code to ${flow.phone}',
              style: AppTypography.bodySmall(color: t.textTertiary),
            ),
            if (flow.devOtp != null) ...[
              const SizedBox(height: AppSpacing.s2),
              Text(
                'Dev OTP: ${flow.devOtp}',
                style: AppTypography.caption(color: t.warningText),
              ),
            ],
            const SizedBox(height: AppSpacing.s8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(_length, (i) {
                return SizedBox(
                  width: 44,
                  height: 52,
                  child: TextField(
                    controller: _controllers[i],
                    focusNode: _nodes[i],
                    textAlign: TextAlign.center,
                    keyboardType: TextInputType.number,
                    maxLength: 1,
                    style: AppTypography.h2(color: t.textPrimary),
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    autofillHints:
                        i == 0 ? const [AutofillHints.oneTimeCode] : null,
                    decoration: InputDecoration(
                      counterText: '',
                      filled: true,
                      fillColor: t.surface,
                      contentPadding: EdgeInsets.zero,
                      enabledBorder: OutlineInputBorder(
                        borderRadius: AppRadius.borderSm,
                        borderSide: BorderSide(
                          color: hasError ? t.danger : t.border,
                          width: hasError ? 2 : 1,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: AppRadius.borderSm,
                        borderSide: BorderSide(
                          color: hasError ? t.danger : t.primary,
                          width: 2,
                        ),
                      ),
                    ),
                    onChanged: (v) => _onChanged(i, v),
                  ),
                );
              }),
            ),
            if (hasError) ...[
              const SizedBox(height: AppSpacing.s3),
              Text(_error!, style: AppTypography.bodySmall(color: t.dangerText)),
            ],
            const SizedBox(height: AppSpacing.s6),
            if (_loading)
              Center(child: CircularProgressIndicator(color: t.primary))
            else
              AppButton(
                label: _secondsLeft > 0
                    ? 'Resend in ${_secondsLeft}s'
                    : 'Resend OTP',
                variant: AppButtonVariant.ghost,
                onPressed: _secondsLeft > 0 ? null : _resend,
              ),
          ],
        ),
      ),
    );
  }
}
