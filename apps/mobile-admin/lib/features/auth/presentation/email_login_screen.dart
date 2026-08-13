import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../router/routes.dart';
import '../application/login_flow_provider.dart';

class EmailLoginScreen extends ConsumerStatefulWidget {
  const EmailLoginScreen({super.key});

  @override
  ConsumerState<EmailLoginScreen> createState() => _EmailLoginScreenState();
}

class _EmailLoginScreenState extends ConsumerState<EmailLoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  var _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter email and password');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref.read(authRepositoryProvider).passwordLogin(
            _email.text.trim(),
            _password.text,
          );
      ref.read(loginFlowProvider.notifier).setTenants(result.tenants);
      if (!mounted) return;
      if (result.requiresTenantSelection || result.tenants.length > 1) {
        context.go(AdminRoutes.selectSchool);
        return;
      }
      if (result.tenants.length == 1) {
        await ref
            .read(authRepositoryProvider)
            .selectTenant(result.tenants.first.id);
      }
      final session = await ref.read(authRepositoryProvider).fetchSession();
      await ref.read(sessionProvider.notifier).setSession(session);
      if (!mounted) return;
      context.go(AdminRoutes.home);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not sign in. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Email sign in'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.s6),
        children: [
          AppTextField(
            label: 'Email',
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
          ),
          const SizedBox(height: AppSpacing.s4),
          AppTextField(
            label: 'Password',
            controller: _password,
            obscureText: true,
            errorText: _error,
            autofillHints: const [AutofillHints.password],
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppSpacing.s6),
          AppButton(
            label: 'Sign in',
            expanded: true,
            loading: _loading,
            onPressed: _loading ? null : _submit,
          ),
        ],
      ),
    );
  }
}
