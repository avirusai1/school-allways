import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router/routes.dart';
import '../application/login_flow_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _controller = TextEditingController();
  var _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    final digits = _controller.text.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 10) {
      setState(() => _error = 'Enter a valid 10-digit mobile number');
      return;
    }

    final phone = '+91$digits';
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final result =
          await ref.read(authRepositoryProvider).requestOtp(phone);
      ref.read(loginFlowProvider.notifier)
        ..setPhone(phone)
        ..setOtpMeta(
          resendAfterSeconds: result.resendAfterSeconds,
          devOtp: result.devOtp,
        );
      if (!mounted) return;
      context.go(Routes.otp);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not send OTP. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.s6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: AppSpacing.s16),
              Text(
                'School All Ways',
                style: AppTypography.h1(color: t.primary),
              ),
              const SizedBox(height: AppSpacing.s8),
              Text('Sign in', style: AppTypography.display(color: t.textPrimary)),
              const SizedBox(height: AppSpacing.s2),
              Text(
                'Use the mobile number registered with your school',
                style: AppTypography.bodySmall(color: t.textTertiary),
              ),
              const SizedBox(height: AppSpacing.s8),
              AppTextField(
                label: 'Mobile number',
                controller: _controller,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.done,
                errorText: _error,
                hint: '98765 43210',
                autofillHints: const [AutofillHints.telephoneNumber],
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                prefix: Container(
                  margin: const EdgeInsets.only(right: AppSpacing.s2),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.s3,
                    vertical: AppSpacing.s2,
                  ),
                  decoration: BoxDecoration(
                    color: t.surfaceAlt,
                    borderRadius: AppRadius.borderSm,
                  ),
                  child: Text('+91', style: AppTypography.body(color: t.textSecondary)),
                ),
                onSubmitted: (_) => _sendOtp(),
              ),
              const SizedBox(height: AppSpacing.s6),
              AppButton(
                label: 'Send OTP',
                expanded: true,
                loading: _loading,
                onPressed: _loading ? null : _sendOtp,
              ),
              const SizedBox(height: AppSpacing.s4),
              Text(
                'By continuing you agree to our Terms and Privacy Policy',
                textAlign: TextAlign.center,
                style: AppTypography.caption(color: t.textTertiary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
