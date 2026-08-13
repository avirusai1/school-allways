import 'package:design_system/design_system.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:phosphoricons_flutter/phosphoricons_flutter.dart';

import '../../../core/providers.dart';
import '../../../router/routes.dart';

class DriverHomeScreen extends ConsumerStatefulWidget {
  const DriverHomeScreen({super.key});

  @override
  ConsumerState<DriverHomeScreen> createState() => _DriverHomeScreenState();
}

class _DriverHomeScreenState extends ConsumerState<DriverHomeScreen> {
  var _pickup = true;
  var _running = false;
  var _loading = true;
  String? _tripId;
  String? _routeId;
  String _routeTitle = 'Route';
  List<_StopRow> _stops = const [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final routesRes = await api.get<List<dynamic>>('/transport/routes');
      final routes = (routesRes.data ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      if (routes.isEmpty) {
        setState(() {
          _loading = false;
          _error = 'No routes assigned yet.';
        });
        return;
      }
      final route = routes.first;
      final routeId = route['id'] as String;
      final stopsRes = await api.get<List<dynamic>>(
        '/transport/routes/$routeId/stops',
      );
      final stops = (stopsRes.data ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(
            (s) => _StopRow(
              id: s['id'] as String? ?? '',
              name: s['name'] as String? ?? 'Stop',
            ),
          )
          .toList();
      setState(() {
        _routeId = routeId;
        _routeTitle =
            '${route['code'] ?? ''} · ${route['name'] ?? 'Route'}'.trim();
        _stops = stops;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Could not load routes.';
      });
    }
  }

  Future<void> _toggleRoute() async {
    if (_running) {
      final tripId = _tripId;
      if (tripId != null) {
        try {
          final api = ref.read(apiClientProvider);
          await api.post<Map<String, dynamic>>('/transport/trips/$tripId/end');
        } catch (_) {}
      }
      setState(() {
        _running = false;
        _tripId = null;
      });
      return;
    }

    final routeId = _routeId;
    if (routeId == null) return;
    HapticFeedback.heavyImpact();
    try {
      final api = ref.read(apiClientProvider);
      final day = DateTime.now().toIso8601String().substring(0, 10);
      final res = await api.post<Map<String, dynamic>>(
        '/transport/trips',
        data: {
          'routeId': routeId,
          'day': day,
          'direction': _pickup ? 'pickup' : 'drop',
        },
      );
      final tripId = res.data?['id'] as String?;
      setState(() {
        _running = true;
        _tripId = tripId;
      });
      if (mounted && tripId != null) {
        context.push(AdminRoutes.scanBoarding, extra: tripId);
      }
    } catch (_) {
      setState(() => _error = 'Could not start trip.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: SawAppBar(
        title: _routeTitle,
        actions: [
          IconButton(
            icon: Icon(PhosphorIconsRegular.warning, color: t.danger),
            onPressed: () => context.push(
              AdminRoutes.sos,
              extra: _tripId,
            ),
          ),
        ],
      ),
      body: _loading
          ? const Padding(
              padding: EdgeInsets.all(AppSpacing.s4),
              child: SkeletonList(count: 5, rowHeight: 56),
            )
          : Padding(
              padding: const EdgeInsets.all(AppSpacing.s4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: AppTypography.bodySmall(color: t.danger),
                    ),
                    const SizedBox(height: AppSpacing.s3),
                  ],
                  Text(
                    'Direction',
                    style: AppTypography.label(color: t.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.s2),
                  SizedBox(
                    height: 56,
                    child: Row(
                      children: [
                        Expanded(
                          child: AppButton(
                            label: 'Pickup',
                            variant: _pickup
                                ? AppButtonVariant.secondary
                                : AppButtonVariant.outline,
                            expanded: true,
                            onPressed: _running
                                ? null
                                : () => setState(() => _pickup = true),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.s2),
                        Expanded(
                          child: AppButton(
                            label: 'Drop',
                            variant: !_pickup
                                ? AppButtonVariant.secondary
                                : AppButtonVariant.outline,
                            expanded: true,
                            onPressed: _running
                                ? null
                                : () => setState(() => _pickup = false),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  SizedBox(
                    height: 88,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: _running ? t.warning : t.success,
                        foregroundColor: t.textOnPrimary,
                        shape: RoundedRectangleBorder(
                          borderRadius: AppRadius.borderMd,
                        ),
                      ),
                      onPressed: _toggleRoute,
                      child: Text(
                        _running ? 'ROUTE RUNNING' : 'START ROUTE',
                        style: AppTypography.h2(color: t.textOnPrimary),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.s4),
                  Text('Stops', style: AppTypography.h3(color: t.textPrimary)),
                  const SizedBox(height: AppSpacing.s2),
                  Expanded(
                    child: ListView.builder(
                      itemCount: _stops.length,
                      itemBuilder: (context, i) {
                        final stop = _stops[i];
                        return AppListTile(
                          title: stop.name,
                          subtitle: 'Stop ${i + 1}',
                          dense: true,
                          showChevron: true,
                          onTap: () {
                            if (_tripId != null) {
                              context.push(
                                AdminRoutes.scanBoarding,
                                extra: _tripId,
                              );
                            }
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _StopRow {
  const _StopRow({required this.id, required this.name});
  final String id;
  final String name;
}

class ScanBoardingScreen extends ConsumerStatefulWidget {
  const ScanBoardingScreen({super.key, this.tripId});

  final String? tripId;

  @override
  ConsumerState<ScanBoardingScreen> createState() => _ScanBoardingScreenState();
}

class _ScanBoardingScreenState extends ConsumerState<ScanBoardingScreen> {
  final _boarded = <String>{};
  var _manualId = '';
  String? _message;

  Future<void> _board(String studentId) async {
    final tripId = widget.tripId;
    if (tripId == null || studentId.isEmpty) return;
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/transport/trips/$tripId/boarding',
        data: {
          'events': [
            {
              'studentId': studentId,
              'event': 'boarded',
              'at': DateTime.now().toUtc().toIso8601String(),
              'scanMethod': 'manual',
            },
          ],
        },
      );
      HapticFeedback.selectionClick();
      setState(() {
        _boarded.add(studentId);
        _message = 'Boarded';
      });
    } catch (_) {
      setState(() => _message = 'Scan failed — queued offline? Retry.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'Scan boarding'),
      body: Column(
        children: [
          Expanded(
            flex: 5,
            child: Container(
              width: double.infinity,
              color: t.surfaceAlt,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(PhosphorIconsRegular.qrCode, size: 72, color: t.textTertiary),
                  const SizedBox(height: AppSpacing.s3),
                  Text(
                    '${_boarded.length}',
                    style: AppTypography.numericLarge(color: t.textPrimary),
                  ),
                  Text(
                    'Boarded this session',
                    style: AppTypography.caption(color: t.textTertiary),
                  ),
                  if (_message != null) ...[
                    const SizedBox(height: AppSpacing.s2),
                    Text(
                      _message!,
                      style: AppTypography.bodySmall(color: t.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.s3),
            child: Column(
              children: [
                AppTextField(
                  label: 'Student id (manual)',
                  onChanged: (v) => _manualId = v.trim(),
                ),
                const SizedBox(height: AppSpacing.s2),
                AppButton(
                  label: 'Mark boarded',
                  variant: AppButtonVariant.outline,
                  expanded: true,
                  onPressed: () => _board(_manualId),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 3,
            child: ListView.builder(
              itemCount: _boarded.length,
              itemBuilder: (context, i) {
                final id = _boarded.elementAt(i);
                return AppListTile(
                  dense: true,
                  title: id,
                  trailing: const AppChip(
                    label: 'Boarded',
                    tone: AppChipTone.success,
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class SosScreen extends ConsumerStatefulWidget {
  const SosScreen({super.key, this.tripId});

  final String? tripId;

  @override
  ConsumerState<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends ConsumerState<SosScreen> {
  var _holding = false;
  var _progress = 0.0;
  var _fired = false;
  String? _error;

  Future<void> _holdStart() async {
    setState(() {
      _holding = true;
      _progress = 0;
      _fired = false;
      _error = null;
    });
    const steps = 30;
    for (var i = 1; i <= steps; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      if (!_holding || !mounted) return;
      setState(() => _progress = i / steps);
    }
    if (!mounted || !_holding) return;
    HapticFeedback.heavyImpact();
    final tripId = widget.tripId;
    if (tripId == null) {
      setState(() {
        _fired = false;
        _holding = false;
        _progress = 0;
        _error = 'Start a trip before raising SOS.';
      });
      return;
    }
    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/transport/trips/$tripId/sos',
        data: {'type': 'panic'},
      );
      setState(() => _fired = true);
    } catch (_) {
      setState(() {
        _fired = false;
        _error = 'SOS failed to send. Try again.';
      });
    }
  }

  void _holdEnd() {
    if (_fired) return;
    setState(() {
      _holding = false;
      _progress = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      backgroundColor: t.appBackground,
      appBar: const SawAppBar(title: 'SOS'),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              _fired
                  ? 'Alert sent to school & transport in-charge'
                  : 'HOLD FOR 3 SECONDS',
              style: AppTypography.h3(color: t.textPrimary),
              textAlign: TextAlign.center,
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.s3),
              Text(
                _error!,
                style: AppTypography.bodySmall(color: t.danger),
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: AppSpacing.s6),
            GestureDetector(
              onTapDown: (_) => _holdStart(),
              onTapUp: (_) => _holdEnd(),
              onTapCancel: _holdEnd,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 160,
                    height: 160,
                    child: CircularProgressIndicator(
                      value: _progress,
                      strokeWidth: 8,
                      color: t.danger,
                    ),
                  ),
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: t.danger,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'SOS',
                      style: AppTypography.h2(color: t.textOnPrimary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
