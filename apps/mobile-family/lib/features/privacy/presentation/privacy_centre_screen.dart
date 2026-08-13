import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

/// Privacy centre — DPDP-facing parent surface (build/13 §16).
class PrivacyCentreScreen extends ConsumerWidget {
  const PrivacyCentreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;

    return AppScaffold(
      appBar: const SawAppBar(title: 'Privacy'),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.s4),
        children: [
          Text('What we hold', style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s2),
          _holdRow(
            context,
            'Profile',
            'Name, photo, class — e.g. "Aarav Sharma, Class 5-A"',
          ),
          _holdRow(
            context,
            'Attendance & academics',
            'Daily marks, homework, exam results',
          ),
          _holdRow(
            context,
            'Fees',
            'Invoices and payment receipts in paise',
          ),
          _holdRow(
            context,
            'Messages',
            'School threads — never your phone number in the thread UI',
          ),
          const SizedBox(height: AppSpacing.s6),
          Text('Consents', style: AppTypography.h3(color: t.textPrimary)),
          const SizedBox(height: AppSpacing.s2),
          AppListTile(
            title: 'Essential school operations',
            subtitle: 'Attendance, fees, safety — required to run the school',
            leading: Icon(PhosphorIconsRegular.lock, color: t.textTertiary),
          ),
          AppListTile(
            title: 'Photos in class albums',
            subtitle: 'School gallery featuring your child',
            trailing: Switch(value: true, onChanged: (_) {}),
          ),
          AppListTile(
            title: 'Transport live location',
            subtitle: 'Show the bus while a trip is active',
            trailing: Switch(value: true, onChanged: (_) {}),
          ),
          const SizedBox(height: AppSpacing.s6),
          Text(
            "Who accessed my child's data",
            style: AppTypography.h3(color: t.textPrimary),
          ),
          const SizedBox(height: AppSpacing.s2),
          Text(
            'Access logs from counselling, safe reports, and restricted records appear here. No other school ERP shows parents this.',
            style: AppTypography.bodySmall(color: t.textTertiary),
          ),
          const SizedBox(height: AppSpacing.s3),
          const EmptyState(
            icon: Icons.shield_outlined,
            headline: 'No restricted access yet',
            body: 'When staff open a restricted record, you will see the role, date, and purpose here.',
          ),
          const SizedBox(height: AppSpacing.s6),
          AppButton(
            label: 'Download my data',
            expanded: true,
            variant: AppButtonVariant.secondary,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Export queued — we will notify you when it is ready.',
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: AppSpacing.s3),
          AppButton(
            label: 'Request deletion',
            expanded: true,
            variant: AppButtonVariant.danger,
            onPressed: () async {
              final ok = await showConfirmDialog(
                context,
                title: 'Request deletion?',
                message:
                    'This starts the statutory clock. The school must respond within the period required by law.',
                confirmLabel: 'Request deletion',
                isDestructive: true,
              );
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Deletion request submitted')),
                );
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _holdRow(BuildContext context, String title, String example) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.s3),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: AppTypography.bodyMedium(color: t.textPrimary)),
            const SizedBox(height: AppSpacing.s1),
            Text(example, style: AppTypography.bodySmall(color: t.textTertiary)),
          ],
        ),
      ),
    );
  }
}
