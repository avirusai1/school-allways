import 'package:core_auth/core_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Holds phone + pending tenants across the OTP → school-select hop.
class LoginFlowState {
  const LoginFlowState({
    this.phone = '',
    this.tenants = const [],
    this.resendAfterSeconds = 60,
    this.devOtp,
  });

  final String phone;
  final List<TenantSummary> tenants;
  final int resendAfterSeconds;
  final String? devOtp;

  LoginFlowState copyWith({
    String? phone,
    List<TenantSummary>? tenants,
    int? resendAfterSeconds,
    String? devOtp,
  }) {
    return LoginFlowState(
      phone: phone ?? this.phone,
      tenants: tenants ?? this.tenants,
      resendAfterSeconds: resendAfterSeconds ?? this.resendAfterSeconds,
      devOtp: devOtp ?? this.devOtp,
    );
  }
}

class LoginFlowNotifier extends StateNotifier<LoginFlowState> {
  LoginFlowNotifier() : super(const LoginFlowState());

  void setPhone(String phone) => state = state.copyWith(phone: phone);

  void setOtpMeta({
    required int resendAfterSeconds,
    String? devOtp,
  }) {
    state = state.copyWith(
      resendAfterSeconds: resendAfterSeconds,
      devOtp: devOtp,
    );
  }

  void setTenants(List<TenantSummary> tenants) {
    state = state.copyWith(tenants: tenants);
  }

  void clear() => state = const LoginFlowState();
}

final loginFlowProvider =
    StateNotifierProvider<LoginFlowNotifier, LoginFlowState>(
  (ref) => LoginFlowNotifier(),
);
