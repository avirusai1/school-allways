# 12 — Flutter Foundation

Shared architecture and packages for both apps. Build this before any screen.
**Read `build/11-design-system.md` first** — every widget here consumes those tokens.

---

## PROMPT

Build the Flutter monorepo foundation: `packages/flutter/*` and the two app
shells. Melos-managed. Follow every pattern below exactly; screens in `build/13`
and `build/14` assume these exist.

---

## 1. Monorepo layout

```
melos.yaml                      workspace root
packages/flutter/
├── design_system/              tokens + components  (build/11 §13)
├── core_models/                freezed DTOs mirroring the API
├── core_network/               Dio, interceptors, error mapping
├── core_auth/                  token storage, session, tenant switching
├── core_sync/                  Drift, cursors, outbox
└── core_ui/                    shared feature widgets (student tile, etc.)

apps/mobile-family/    com.schoolallways.family    "School All Ways"
apps/mobile-admin/     com.schoolallways.admin     "School All Ways Admin"
```

### App internal structure (identical in both)

```
lib/
├── main.dart                   bootstrap, ProviderScope, error zone
├── app.dart                    MaterialApp.router, theme, localisation
├── router/
│   ├── app_router.dart         go_router
│   ├── routes.dart             route name constants
│   └── nav_registry.dart       manifest key -> route  ← server-driven nav
├── features/<feature>/
│   ├── data/
│   │   ├── <f>_repository.dart      remote + local, decides which
│   │   └── <f>_dao.dart             Drift queries
│   ├── domain/<f>_model.dart        freezed
│   ├── application/<f>_provider.dart  Riverpod
│   └── presentation/
│       ├── <f>_screen.dart
│       └── widgets/
└── core/                       app-specific glue only
```

---

## 2. State management — Riverpod, one pattern

```dart
/// EVERY screen that loads data uses this shape. No exceptions, so that
/// loading/error/empty handling is identical in all 60 screens.
@riverpod
class AttendanceRoster extends _$AttendanceRoster {
  @override
  Future<RosterState> build(String sectionId, DateTime day) async {
    final repo = ref.watch(attendanceRepositoryProvider);

    // OFFLINE-FIRST: emit cache immediately so the screen never shows a
    // spinner when we already have data, then refresh in the background.
    final cached = await repo.getCachedRoster(sectionId, day);
    if (cached != null) {
      state = AsyncData(cached);
      unawaited(_refresh(sectionId, day));
      return cached;
    }
    return repo.fetchRoster(sectionId, day);
  }

  /// Optimistic local write. The outbox handles the network.
  Future<void> mark(String studentId, AttendanceStatus status) async {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData(current.withStatus(studentId, status));
    await ref.read(attendanceRepositoryProvider).queueMark(...);
  }
}
```

**Rules**

- `AsyncNotifierProvider` for anything that loads. Never `FutureProvider` in a
  screen — you cannot refresh or mutate it.
- `ref.watch(p.select((s) => s.field))` so a widget rebuilds only on the field
  it reads. Watching a whole object in a 40-row list rebuilds all 40.
- **No `setState` in feature code.** Local ephemeral UI state only (a text
  controller, an expansion flag).
- Providers never import Flutter widgets.

---

## 3. Networking — `core_network`

```dart
class ApiClient {
  ApiClient(this._dio);

  /// Interceptor order matters and is fixed:
  ///   1. AuthInterceptor      attaches the bearer token
  ///   2. TenantInterceptor    attaches X-Request-Id, Accept-Language
  ///   3. IdempotencyInterceptor  injects X-Client-Mutation-Id on POST/PATCH
  ///   4. RetryInterceptor     exponential backoff on 5xx and network errors
  ///   5. ErrorInterceptor     maps the error envelope to typed exceptions
  ///   6. LogInterceptor       debug builds only, redacts phone/OTP/token
}
```

### Token refresh — the part people get wrong

```dart
/// Concurrent 401s must trigger ONE refresh, not N. On app resume, six
/// providers fire at once; six refresh calls will race, and five of them will
/// present an already-rotated token — which our reuse detection correctly
/// treats as theft and logs the user out of everything.
Future<void> _refreshOnce() {
  return _inFlight ??= _doRefresh().whenComplete(() => _inFlight = null);
}
```

### Error mapping

```dart
sealed class ApiException implements Exception {
  final String code; final String message; final Map<String, String>? fields;
}
class ValidationException  extends ApiException {}  // 400 VALIDATION_FAILED
class UnauthenticatedException extends ApiException {}
class PermissionException  extends ApiException {}  // 403 PERMISSION_DENIED
class ScopeException       extends ApiException {}  // 403 SCOPE_VIOLATION
class ConflictException    extends ApiException {}
class RateLimitException   extends ApiException { final int retryAfterSeconds; }
class OfflineException     extends ApiException {}
```

**Always show `message` from the server.** It is written for school users. Never
substitute "Something went wrong" for a message the API took care to write.

---

## 4. Offline — `core_sync`

### Drift schema (mirrors the server, adds sync columns)

```dart
class CachedStudents extends Table {
  TextColumn get id => text()();
  TextColumn get tenantId => text()();
  TextColumn get payload => text()();        // the JSON DTO
  IntColumn  get rowVersion => integer()();  // server cursor
  DateTimeColumn get cachedAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}

class SyncCursors extends Table {
  TextColumn get entity => text()();
  IntColumn  get lastRowVersion => integer().withDefault(const Constant(0))();
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();
  @override Set<Column> get primaryKey => {entity};
}

class OutboxEntries extends Table {
  TextColumn get id => text()();              // == X-Client-Mutation-Id
  TextColumn get method => text()();
  TextColumn get path => text()();
  TextColumn get body => text()();
  IntColumn  get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime()();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  @override Set<Column> get primaryKey => {id};
}
```

### Outbox worker

```
on connectivity restored, and every 30s while online:
  entries where nextAttemptAt <= now, ordered by createdAt, max 10 per pass
  → POST with X-Client-Mutation-Id
  → 2xx            : delete entry, apply server response to cache
  → 4xx (not 429)  : delete entry, surface a persistent error to the user
                     (a bad request will never succeed; retrying forever hides it)
  → 429 / 5xx / net: attempts++, backoff 2^n capped at 5 min, keep
  → attempts > 8   : park it, show "Couldn't sync — tap for details"
```

**The outbox survives force-quit.** Test that explicitly: mark attendance in
airplane mode, kill the app, reopen, go online, verify it syncs exactly once.

### Sync controller

```dart
/// Implements docs/04 click-to-sync.
/// - checkStatus(): GET /sync/status, updates pendingCount. Called on resume
///   and on a silent FCM data message. Costs ~200 bytes.
/// - pull(): GET /sync/pull, pages until hasMore is false. USER-TRIGGERED.
/// - Payloads > 50 KB are decoded in an isolate via compute() — parsing on the
///   UI thread is a visible stutter on a 2 GB phone.
```

---

## 5. Server-driven navigation

```dart
// router/nav_registry.dart
/// Maps a manifest key from GET /auth/session to a route + tab metadata.
/// Adding a screen = adding an entry here + a seed nav change. It NEVER
/// requires a store release to change who sees what.
const navRegistry = <String, NavItem>{
  'teacher_home':     NavItem(Routes.teacherHome, 'Home', PhosphorIcons.house),
  'take_attendance':  NavItem(Routes.takeAttendance, 'Attendance', PhosphorIcons.checkSquare),
  'marks_entry':      NavItem(Routes.marksEntry, 'Marks', PhosphorIcons.listNumbers),
  'gate_scanner':     NavItem(Routes.gateScanner, 'Gate', PhosphorIcons.qrCode),
  'driver_home':      NavItem(Routes.driverHome, 'Route', PhosphorIcons.bus),
  // ...
};

/// Unknown key from a newer server => SKIP IT SILENTLY. An old client must
/// never crash because the server learned a new screen.
List<NavItem> resolveNav(List<String> manifest) =>
    manifest.map((k) => navRegistry[k]).nonNulls.toList();
```

Bottom nav shows the first 4 items + "More". `go_router` `redirect` guards
routes: if a manifest key is absent, navigating there redirects to `homeScreen`.

---

## 6. Localisation

- `flutter_localizations` + ARB files, `en` and `hi`.
- Language picked in the first-run flow, persisted, sent as `Accept-Language`.
- **Never concatenate translated strings.** Use placeholders:
  `'{count} students marked present'`.
- Numbers: Indian grouping (`12,50,000` not `1,250,000`). One `MoneyText` widget
  and one `formatIndianNumber()` — never format inline.
- Dates: `10 Aug 2026`. Never `10/08/2026`.

---

## 7. Performance rules

- `const` constructors everywhere. A non-const leaf widget in a 40-row list is
  40 avoidable rebuilds.
- `ListView.builder` / `SliverList` always. Never a mapped `Column`.
- `RepaintBoundary` around list rows that contain images.
- `cached_network_image` with explicit `memCacheWidth` — decoding a 2000px
  photo into a 40px avatar is how you OOM a 2 GB phone.
- Heavy JSON in `compute()`.
- Drift queries off the UI isolate.
- **Split-per-ABI APKs** or an App Bundle. Universal APK is ~40% larger.
- Profile with `flutter run --profile` **on a real budget device**. The
  simulator lies about exactly the phones our users own.

---

## 8. App shell

```dart
// app.dart
class SchoolAllWaysApp extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return MaterialApp.router(
      title: 'School All Ways',
      // Theme is built from the SCHOOL's primary colour (white-label).
      theme: AppTheme.build(session.valueOrNull?.tenant.primaryColor),
      locale: ref.watch(localeProvider),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: const [Locale('en'), Locale('hi')],
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) => MediaQuery.withClampedTextScaling(
        minScaleFactor: 1.0,
        maxScaleFactor: 2.0,   // support 200% without unbounded layout breakage
        child: child!,
      ),
    );
  }
}
```

---

## 9. Acceptance criteria

- [ ] Outbox survives force-quit and replays exactly once
- [ ] Concurrent 401s trigger exactly one refresh call
- [ ] Sync payload parsing does not block the UI thread
- [ ] Unknown nav manifest key is skipped, not crashed on
- [ ] Every screen renders correctly in Hindi and at 200% text scale
- [ ] No hardcoded colour, size or duration outside `design_system`
- [ ] Family APK < 25 MB (split per ABI)
- [ ] Cold start to first frame < 1.5 s on a 2 GB device
