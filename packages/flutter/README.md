# Flutter packages & apps

Melos workspace for School All Ways mobile.

```
packages/flutter/
  design_system/   # build/11 — tokens + components
  core_models/
  core_network/    # Dio + single-flight refresh
  core_auth/
  core_sync/       # Drift outbox + sync
  core_ui/
apps/
  mobile-family/   # com.schoolallways.family
  mobile-admin/    # com.schoolallways.admin
```

## Setup

Flutter SDK is required locally (not installed in this CI environment by default):

```bash
# once Flutter is on PATH
dart pub global activate melos
melos bootstrap
cd apps/mobile-family && flutter run
```

## Rules

- Feature widgets read `context.tokens` / Theme — never `AppColors` directly.
- Money is integer paise; format with `MoneyText` / `formatIndianMoney`.
- No emoji, gradients (except login), or skeleton shimmer.
