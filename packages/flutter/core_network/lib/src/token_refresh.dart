/// Single-flight token refresh.
///
/// Concurrent 401s must trigger ONE refresh, not N. On app resume, six
/// providers fire at once; six refresh calls will race, and five of them will
/// present an already-rotated token — which our reuse detection correctly
/// treats as theft and logs the user out of everything.
class TokenRefreshCoordinator {
  TokenRefreshCoordinator(this._doRefresh);

  final Future<void> Function() _doRefresh;
  Future<void>? _inFlight;

  /// Concurrent callers share the same in-flight Future.
  Future<void> refreshOnce() {
    return _inFlight ??= _doRefresh().whenComplete(() => _inFlight = null);
  }

  bool get isRefreshing => _inFlight != null;
}
