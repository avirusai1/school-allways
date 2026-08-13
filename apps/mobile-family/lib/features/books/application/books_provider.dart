import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/child_switcher_provider.dart';
import '../../../core/providers.dart';
import '../domain/book_shelf_item.dart';

final booksShelfProvider =
    FutureProvider.autoDispose<List<BookShelfItem>>((ref) async {
  final studentId = await ref.watch(childSwitcherProvider.future);
  if (studentId == null || studentId.isEmpty) return const [];
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/family/books',
    queryParameters: {'studentId': studentId},
  );
  final data = res.data?['data'] as List<dynamic>? ?? const [];
  return data
      .whereType<Map<String, dynamic>>()
      .map(BookShelfItem.fromJson)
      .toList();
});
