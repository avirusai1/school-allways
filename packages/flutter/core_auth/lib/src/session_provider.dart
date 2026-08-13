import 'package:core_models/core_models.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_repository.dart';
import 'token_store.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

/// Injected by each app's bootstrap after [ApiClient] is constructed.
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  throw UnimplementedError(
    'Override authRepositoryProvider in ProviderScope',
  );
});

/// Current session. Null when signed out.
final sessionProvider =
    StateNotifierProvider<SessionNotifier, AsyncValue<AuthSession?>>((ref) {
  return SessionNotifier(ref.watch(authRepositoryProvider));
});

class SessionNotifier extends StateNotifier<AsyncValue<AuthSession?>> {
  SessionNotifier(this._repo) : super(const AsyncValue.loading()) {
    _restore();
  }

  final AuthRepository _repo;

  Future<void> _restore() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_repo.restore);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_repo.fetchSession);
  }

  Future<void> setSession(AuthSession session) async {
    state = AsyncValue.data(session);
  }

  Future<void> signOut() async {
    await _repo.signOut();
    state = const AsyncValue.data(null);
  }
}
