import 'package:core_auth/core_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Holds the pending tenant list across the login → school-select hop.
class LoginFlowState {
  const LoginFlowState({this.tenants = const []});

  final List<TenantSummary> tenants;

  LoginFlowState copyWith({List<TenantSummary>? tenants}) {
    return LoginFlowState(tenants: tenants ?? this.tenants);
  }
}

class LoginFlowNotifier extends StateNotifier<LoginFlowState> {
  LoginFlowNotifier() : super(const LoginFlowState());

  void setTenants(List<TenantSummary> tenants) {
    state = state.copyWith(tenants: tenants);
  }

  void clear() => state = const LoginFlowState();
}

final loginFlowProvider =
    StateNotifierProvider<LoginFlowNotifier, LoginFlowState>(
  (ref) => LoginFlowNotifier(),
);
