import 'dart:convert';

import 'package:core_network/core_network.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/family_home.dart';

class FamilyHomeRepository {
  FamilyHomeRepository({
    required ApiClient api,
    required SharedPreferences prefs,
  })  : _api = api,
        _prefs = prefs;

  final ApiClient _api;
  final SharedPreferences _prefs;

  static const _childrenKey = 'family_children';

  String _cacheKey(String studentId) => 'family_home_$studentId';

  Future<FamilyHome?> getCached(String studentId) async {
    final raw = _prefs.getString(_cacheKey(studentId));
    if (raw == null) return null;
    try {
      return FamilyHome.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<FamilyHome> fetch(String studentId) async {
    try {
      final res = await _api.get<Map<String, dynamic>>(
        '/family/home',
        queryParameters: {'studentId': studentId},
      );
      final data = res.data ?? const <String, dynamic>{};
      await _prefs.setString(_cacheKey(studentId), jsonEncode(data));
      return FamilyHome.fromJson(data);
    } catch (_) {
      final cached = await getCached(studentId);
      if (cached != null) return cached;
      return FamilyHome.empty(studentId: studentId, name: 'Your child');
    }
  }

  Future<List<ChildSummary>> listChildren() async {
    try {
      final res = await _api.get<Map<String, dynamic>>('/family/children');
      final data = res.data?['data'] as List<dynamic>? ??
          res.data?['children'] as List<dynamic>? ??
          const [];
      final children = data
          .map((e) => ChildSummary.fromJson(e as Map<String, dynamic>))
          .toList();
      await _prefs.setString(
        _childrenKey,
        jsonEncode(children.map((c) => c.toJson()).toList()),
      );
      return children;
    } catch (_) {
      final raw = _prefs.getString(_childrenKey);
      if (raw != null) {
        try {
          final list = jsonDecode(raw) as List<dynamic>;
          return list
              .whereType<Map<String, dynamic>>()
              .map(ChildSummary.fromJson)
              .toList();
        } catch (_) {}
      }
      // Demo child so the shell is usable before the API is wired.
      return const [
        ChildSummary(id: 'demo', fullName: 'Your child', firstName: 'Child'),
      ];
    }
  }
}
