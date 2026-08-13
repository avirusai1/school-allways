import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _selectedStudentKey = 'saw.selected_student_id';

/// Persists the active child per device (and implicitly per school install).
class ChildSwitcherNotifier extends AsyncNotifier<String?> {
  @override
  Future<String?> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_selectedStudentKey);
  }

  Future<void> select(String studentId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_selectedStudentKey, studentId);
    state = AsyncData(studentId);
  }

  /// Prefer [preferred] when nothing is stored yet.
  Future<String> ensureSelection(List<String> studentIds) async {
    if (studentIds.isEmpty) {
      state = const AsyncData(null);
      return '';
    }
    final current = state.valueOrNull;
    if (current != null && studentIds.contains(current)) return current;
    final next = studentIds.first;
    await select(next);
    return next;
  }
}

final childSwitcherProvider =
    AsyncNotifierProvider<ChildSwitcherNotifier, String?>(
  ChildSwitcherNotifier.new,
);
