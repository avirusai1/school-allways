import 'package:core_auth/core_auth.dart';
import 'package:core_network/core_network.dart';
import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../router/routes.dart';
import '../application/login_flow_provider.dart';

class SelectSchoolScreen extends ConsumerStatefulWidget {
  const SelectSchoolScreen({super.key});

  @override
  ConsumerState<SelectSchoolScreen> createState() => _SelectSchoolScreenState();
}

class _SelectSchoolScreenState extends ConsumerState<SelectSchoolScreen> {
  String? _busyId;
  String? _error;

  Future<void> _pick(TenantSummary tenant) async {
    setState(() {
      _busyId = tenant.id;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).selectTenant(
            tenant.id,
            branchId: tenant.branchId,
          );
      final session = await ref.read(authRepositoryProvider).fetchSession();
      await ref.read(sessionProvider.notifier).setSession(session);
      ref.read(loginFlowProvider.notifier).clear();
      if (!mounted) return;
      context.go(AdminRoutes.home);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Could not open this school. Try again.');
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final tenants = ref.watch(loginFlowProvider).tenants;

    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Choose school'),
      body: ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.s4),
        itemCount: tenants.length + (_error != null ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.s3),
        itemBuilder: (context, index) {
          if (_error != null && index == 0) {
            return Text(
              _error!,
              style: AppTypography.bodySmall(color: t.dangerText),
            );
          }
          final tenant = tenants[_error != null ? index - 1 : index];
          final busy = _busyId == tenant.id;
          return AppCard(
            onTap: busy ? null : () => _pick(tenant),
            child: Row(
              children: [
                AppAvatar(
                  imageUrl: tenant.logoUrl,
                  initials: tenant.name.isNotEmpty ? tenant.name[0] : 'S',
                  size: 40,
                ),
                const SizedBox(width: AppSpacing.s3),
                Expanded(
                  child: Text(
                    tenant.name,
                    style: AppTypography.bodyMedium(color: t.textPrimary),
                  ),
                ),
                if (busy)
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: t.primary,
                    ),
                  )
                else
                  Icon(PhosphorIconsRegular.caretRight, color: t.textTertiary),
              ],
            ),
          );
        },
      ),
    );
  }
}
