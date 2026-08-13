import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../../paywall/presentation/paywall_panel.dart';

class BusLive {
  const BusLive({
    required this.routeName,
    this.stopsAway,
    this.eta,
    this.stopName,
    this.live,
  });

  final String routeName;
  final int? stopsAway;
  final String? eta;
  final String? stopName;
  final Map<String, dynamic>? live;

  bool get isRunning => live != null;

  factory BusLive.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const BusLive(routeName: 'Bus');
    }
    return BusLive(
      routeName: json['routeName'] as String? ?? 'Bus',
      stopsAway: json['stopsAway'] as int?,
      eta: json['eta'] as String?,
      stopName: json['stopName'] as String?,
      live: json['live'] as Map<String, dynamic>?,
    );
  }
}

final busProvider = FutureProvider.autoDispose<BusLive?>((ref) async {
  final studentId = ref.watch(childSwitcherProvider).valueOrNull;
  if (studentId == null || studentId.isEmpty) return null;
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/family/bus',
    queryParameters: {'studentId': studentId},
  );
  if (res.data == null || res.data!.isEmpty) return null;
  return BusLive.fromJson(res.data);
});

/// Bus tracking — map tiles deferred; live status + disconnect-on-background.
class BusScreen extends ConsumerStatefulWidget {
  const BusScreen({super.key});

  @override
  ConsumerState<BusScreen> createState() => _BusScreenState();
}

class _BusScreenState extends ConsumerState<BusScreen>
    with WidgetsBindingObserver {
  bool _foreground = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Spec: disconnect sockets on background — 1,800 phones holding sockets
    // is a real server cost. We only poll while foregrounded.
    final next = state == AppLifecycleState.resumed;
    if (next != _foreground) {
      setState(() => _foreground = next);
      if (next) ref.invalidate(busProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final async = ref.watch(busProvider);

    return AppScaffold(
      appBar: const SawAppBar(title: 'Bus'),
      body: async.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.s4),
          child: Skeleton(width: double.infinity, height: 200),
        ),
        error: (e, _) => GatedPaywallOrError(
          error: e,
          fallbackMessage: 'Could not load bus tracking.',
          onRetry: () => ref.invalidate(busProvider),
        ),
        data: (bus) {
          if (bus == null) {
            return const EmptyState(
              icon: Icons.directions_bus_outlined,
              headline: 'No bus assigned',
              body: 'When your school assigns a route, live tracking will show here.',
            );
          }
          final running = bus.isRunning && _foreground;
          return Column(
            children: [
              Expanded(
                child: Container(
                  width: double.infinity,
                  color: running ? t.infoBg : t.disabledFill,
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        PhosphorIconsRegular.bus,
                        size: 64,
                        color: running ? t.infoText : t.textTertiary,
                      ),
                      const SizedBox(height: AppSpacing.s3),
                      Text(
                        running
                            ? 'Live tracking active'
                            : 'Bus is not running now',
                        style: AppTypography.bodyMedium(
                          color: running ? t.infoText : t.textTertiary,
                        ),
                      ),
                      if (bus.live != null && !_foreground)
                        Text(
                          'Tracking paused while app is in background',
                          style: AppTypography.caption(color: t.textTertiary),
                        ),
                    ],
                  ),
                ),
              ),
              Container(
                constraints: const BoxConstraints(minHeight: 140),
                padding: const EdgeInsets.all(AppSpacing.s4),
                decoration: BoxDecoration(
                  color: t.surface,
                  borderRadius: AppRadius.sheetTop,
                  border: Border(top: BorderSide(color: t.border)),
                ),
                child: SafeArea(
                  top: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(bus.routeName,
                          style: AppTypography.h3(color: t.textPrimary)),
                      if (bus.stopName != null)
                        Text(
                          'Your stop · ${bus.stopName}',
                          style: AppTypography.bodySmall(color: t.textTertiary),
                        ),
                      const SizedBox(height: AppSpacing.s3),
                      Text(
                        running
                            ? '${bus.stopsAway ?? '—'} stops away · ETA ${bus.eta ?? '—'}'
                            : 'Last known position will appear when the trip starts.',
                        style: AppTypography.body(color: t.textPrimary),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
