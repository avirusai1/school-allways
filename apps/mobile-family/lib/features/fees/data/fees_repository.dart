import 'dart:convert';
import 'dart:math';

import 'package:core_network/core_network.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/fees_model.dart';

class FeesRepository {
  FeesRepository(this._api);

  final ApiClient _api;

  static String _key(String studentId) => 'saw.fees.$studentId';

  static const FeesOverview empty = FeesOverview(
    outstandingPaise: 0,
    invoices: [],
  );

  Future<FeesOverview?> getCached(String studentId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(studentId));
    if (raw == null) return null;
    try {
      return FeesOverview.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<FeesOverview> fetch(String studentId) async {
    try {
      final res = await _api.get<Map<String, dynamic>>(
        '/family/fees',
        queryParameters: {'studentId': studentId},
      );
      final data = FeesOverview.fromJson(res.data ?? const {});
      await _cache(studentId, data);
      return data;
    } catch (e) {
      // isRefusal covers SUBSCRIPTION_REQUIRED and also 401/403 — a permission
      // failure must not be served as a cached or zeroed fee overview.
      if (isRefusal(e)) rethrow;
      final cached = await getCached(studentId);
      if (cached != null) return cached;
      await _cache(studentId, empty);
      return empty;
    }
  }

  Future<FeeInvoiceDetail> fetchInvoice(String invoiceId) async {
    final res =
        await _api.get<Map<String, dynamic>>('/fees/invoices/$invoiceId');
    return FeeInvoiceDetail.fromJson(res.data ?? const {});
  }

  Future<PaymentInitiation> initiatePayment({
    required List<String> invoiceIds,
    int? amountPaise,
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/fees/payments/online/initiate',
      data: {
        'invoiceIds': invoiceIds,
        if (amountPaise != null) 'amountPaise': amountPaise,
        'clientMutationId': _clientMutationId(),
      },
    );
    return PaymentInitiation.fromJson(res.data ?? const {});
  }

  Future<PaymentStatus> pollPayment(String paymentId) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/family/payments/$paymentId',
    );
    return PaymentStatus.fromJson(res.data ?? const {});
  }

  Future<void> _cache(String studentId, FeesOverview data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(studentId), jsonEncode(data.toJson()));
  }

  String _clientMutationId() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int b) => b.toRadixString(16).padLeft(2, '0');
    final h = bytes.map(hex).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
        '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}
