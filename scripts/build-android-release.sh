#!/usr/bin/env bash
# Build SIGNED release AAB + universal APK for Play Store upload.
#
# Distinct from build-android-local.sh, which points the API at localhost and
# only makes split APKs for device testing. This one bakes the PRODUCTION API
# host and produces the .aab Play actually accepts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_BASE_URL="${API_BASE_URL:-https://school.techallways.com/api/v1}"

# Android Studio's bundled JDK — the system JDK here is 26, which Gradle/AGP
# does not support.
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "==> API_BASE_URL=${API_BASE_URL}"
echo "==> JAVA_HOME=${JAVA_HOME}"

shopt -s nullglob
for d in "$ROOT"/packages/flutter/*/ "$ROOT"/apps/mobile-family/ "$ROOT"/apps/mobile-admin/; do
  [[ -f "${d}pubspec.yaml" ]] || continue
  (cd "$d" && flutter pub get >/dev/null)
done
echo "==> deps resolved"

OUT="$ROOT/dist/play"
rm -rf "$OUT"; mkdir -p "$OUT"

build_app() {
  local app="$1" name="$2"
  echo ""
  echo "==> $name: verifying signing"
  [[ -f "$ROOT/apps/$app/android/key.properties" ]] \
    || { echo "MISSING key.properties for $app" >&2; exit 1; }
  [[ -f "$ROOT/apps/$app/android/app/google-services.json" ]] \
    || { echo "MISSING google-services.json for $app" >&2; exit 1; }

  echo "==> $name: building app bundle (Play upload format)"
  (cd "$ROOT/apps/$app" && flutter build appbundle --release \
      --dart-define="API_BASE_URL=${API_BASE_URL}")

  echo "==> $name: building universal APK (sideload / manual QA)"
  (cd "$ROOT/apps/$app" && flutter build apk --release \
      --dart-define="API_BASE_URL=${API_BASE_URL}")

  mkdir -p "$OUT/$name"
  cp -f "$ROOT/apps/$app/build/app/outputs/bundle/release/"*.aab "$OUT/$name/" 2>/dev/null || true
  cp -f "$ROOT/apps/$app/build/app/outputs/flutter-apk/app-release.apk" \
        "$OUT/$name/${name}-release.apk" 2>/dev/null || true
}

build_app mobile-family family
build_app mobile-admin admin

echo ""
echo "=========================================="
ls -lh "$OUT"/*/* 2>/dev/null
echo "=========================================="
