import 'package:core_network/core_network.dart';

import '../domain/subscription_models.dart';

class SubscriptionsRepository {
  SubscriptionsRepository(this._api);

  final ApiClient _api;

  Future<SubscriptionList> list({String? q}) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/subscriptions',
      queryParameters: {
        'limit': 100,
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      },
    );
    return SubscriptionList.fromJson(res.data ?? const {});
  }

  Future<ManualActivateResult> manualActivate(List<String> studentIds) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/subscriptions/manual-activate',
      data: {
        'items': [
          for (final id in studentIds) {'studentId': id},
        ],
      },
    );
    return ManualActivateResult.fromJson(res.data ?? const {});
  }

  Future<StayConnectedStatus> stayConnected() async {
    final res = await _api.get<Map<String, dynamic>>(
      '/subscriptions/stay-connected',
    );
    return StayConnectedStatus.fromJson(res.data ?? const {});
  }
}
