#!/usr/bin/env bash
# Build signed RELEASE builds (AAB for Play Store + a single APK for sideload
# testing on your phone) for both apps, pointed at the production API.
#
# Different purpose from build-android-local.sh: that one is for testing
# against a locally-running API on an emulator/device. This one is for the
# real thing — same signing, same API URL the published app will use.
#
# Requires (all already present as of 2026-08-18):
#   apps/mobile-family/android/key.properties + upload-keystore.jks
#   apps/mobile-admin/android/key.properties  + upload-keystore.jks
#   apps/mobile-family/android/app/google-services.json
#   apps/mobile-admin/android/app/google-services.json
#
# Usage:
#   ./scripts/build-android-release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_BASE_URL="https://api.school.techallways.com/v1"

export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "==> API_BASE_URL=${API_BASE_URL}"

for app in mobile-family mobile-admin; do
  ks="$ROOT/apps/$app/android/key.properties"
  gs="$ROOT/apps/$app/android/app/google-services.json"
  if [[ ! -f "$ks" ]]; then
    echo "ERROR: $ks missing. Release build needs a real upload keystore — see docs/release-signing.md." >&2
    exit 1
  fi
  if [[ ! -f "$gs" ]]; then
    echo "ERROR: $gs missing. See docs/push-setup.md." >&2
    exit 1
  fi
done

echo "==> flutter pub get (packages + apps)"
shopt -s nullglob
for d in "$ROOT"/packages/flutter/*/ "$ROOT"/apps/mobile-family/ "$ROOT"/apps/mobile-admin/; do
  [[ -f "${d}pubspec.yaml" ]] || continue
  echo "    ${d#"$ROOT"/}"
  (cd "$d" && flutter pub get)
done

OUT="$ROOT/dist/android-release"
mkdir -p "$OUT"

build_app() {
  local app="$1"
  local name="$2"
  echo ""
  echo "==> Building $name ($app) — app bundle (Play Store)"
  (
    cd "$ROOT/apps/$app"
    flutter build appbundle --release --dart-define="API_BASE_URL=${API_BASE_URL}"
  )
  echo "==> Building $name ($app) — APK (sideload / phone testing)"
  (
    cd "$ROOT/apps/$app"
    flutter build apk --release --dart-define="API_BASE_URL=${API_BASE_URL}"
  )

  mkdir -p "$OUT/$name"
  cp -f "$ROOT/apps/$app/build/app/outputs/bundle/release/app-release.aab" "$OUT/$name/${name}-release.aab"
  cp -f "$ROOT/apps/$app/build/app/outputs/flutter-apk/app-release.apk" "$OUT/$name/${name}-release.apk"
  echo "    copied to dist/android-release/$name/"
}

build_app mobile-family family
build_app mobile-admin admin

echo ""
echo "Done."
echo ""
ls -lh "$OUT"/family "$OUT"/admin
echo ""
echo "Play Store upload:  dist/android-release/family/family-release.aab"
echo "                    dist/android-release/admin/admin-release.aab"
echo ""
echo "Install on your phone to test (USB debugging on, phone connected):"
echo "  adb install -r dist/android-release/family/family-release.apk"
echo "  adb install -r dist/android-release/admin/admin-release.apk"
