import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router/routes.dart';
import '../application/login_flow_provider.dart';

class JoinScreen extends ConsumerStatefulWidget {
  const JoinScreen({super.key, required this.token});

  final String token;

  @override
  ConsumerState<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends ConsumerState<JoinScreen> {
  static const _minLength = 12;

  JoinPreview? _preview;
  String? _error;
  var _loading = true;
  var _submitting = false;
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final preview =
          await ref.read(authRepositoryProvider).previewJoin(widget.token);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'We could not open this invitation.';
        _loading = false;
      });
    }
  }

  Future<void> _activate() async {
    if (_password.text.length < _minLength) {
      setState(() => _error = 'Password must be at least $_minLength characters.');
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = 'The two passwords do not match.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(authRepositoryProvider)
          .activateJoin(widget.token, _password.text);
      if (!mounted) return;
      if (result.status != 'joined') {
        setState(() {
          _preview = result;
          _submitting = false;
        });
        return;
      }
      final session = await ref.read(authRepositoryProvider).fetchSession();
      await ref.read(sessionProvider.notifier).setSession(session);
      ref.read(loginFlowProvider.notifier).clear();
      if (!mounted) return;
      context.go(Routes.home);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not set your password. Try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final preview = _preview;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Join your school'),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(AppSpacing.s6),
              children: [
                if (preview?.status == 'invalid')
                  Text(
                    "This link isn't valid. Ask your school to send it again.",
                    style: AppTypography.body(color: t.textPrimary),
                  )
                else if (preview?.status == 'expired')
                  Text(
                    'This invitation has expired. Ask ${preview?.schoolName ?? 'your school'} to resend it.',
                    style: AppTypography.body(color: t.textPrimary),
                  )
                else if (preview?.status == 'already_activated') ...[
                  Text(
                    "You're already set up. Sign in with your email and password.",
                    style: AppTypography.body(color: t.textPrimary),
                  ),
                  const SizedBox(height: AppSpacing.s6),
                  AppButton(
                    label: 'Sign in',
                    expanded: true,
                    onPressed: () => context.go(Routes.login),
                  ),
                ] else if (preview?.status == 'pending') ...[
                  Text(
                    'Welcome to ${preview?.schoolName ?? 'your school'}',
                    style: AppTypography.h1(color: t.textPrimary),
                  ),
                  const SizedBox(height: AppSpacing.s2),
                  Text(
                    'Set a password to finish setting up your account.',
                    style: AppTypography.bodySmall(color: t.textTertiary),
                  ),
                  const SizedBox(height: AppSpacing.s6),
                  AppTextField(
                    label: 'Password',
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.newPassword],
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  AppTextField(
                    label: 'Confirm password',
                    controller: _confirm,
                    obscureText: true,
                    errorText: _error,
                    onSubmitted: (_) => _activate(),
                  ),
                  const SizedBox(height: AppSpacing.s2),
                  Text(
                    'At least $_minLength characters.',
                    style: AppTypography.caption(color: t.textTertiary),
                  ),
                  const SizedBox(height: AppSpacing.s6),
                  AppButton(
                    label: 'Set password and continue',
                    expanded: true,
                    loading: _submitting,
                    onPressed: _submitting ? null : _activate,
                  ),
                ] else if (_error != null)
                  Text(_error!, style: AppTypography.bodySmall(color: t.dangerText)),
              ],
            ),
    );
  }
}
