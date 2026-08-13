#!/usr/bin/env bash
# Build release APKs for local device / emulator testing.
# Usage:
#   ./scripts/build-android-local.sh
#   ./scripts/build-android-local.sh emulator   # default API → 10.0.2.2:3000
#   ./scripts/build-android-local.sh device     # API → <LAN_IP>:3000
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-emulator}"
if [[ "$MODE" == "device" ]]; then
  LAN="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  if [[ -z "${LAN}" ]]; then
    echo "Could not detect LAN IP. Pass API_BASE_URL explicitly." >&2
    exit 1
  fi
  API_BASE_URL="http://${LAN}:3000/v1"
else
  API_BASE_URL="http://10.0.2.2:3000/v1"
fi

export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "==> API_BASE_URL=${API_BASE_URL}"
echo "==> flutter pub get (packages + apps)"
# Melos 8 expects a pub workspace root; resolve deps package-by-package instead.
shopt -s nullglob
for d in "$ROOT"/packages/flutter/*/ "$ROOT"/apps/mobile-family/ "$ROOT"/apps/mobile-admin/; do
  [[ -f "${d}pubspec.yaml" ]] || continue
  echo "    ${d#"$ROOT"/}"
  (cd "$d" && flutter pub get)
done

OUT="$ROOT/dist/android"
mkdir -p "$OUT"

build_app() {
  local app="$1"
  local name="$2"
  echo "==> Building $name ($app)"
  (
    cd "$ROOT/apps/$app"
    # --split-per-abi: keep APKs small (build/12 §7); install arm64-v8a on modern devices.
    flutter build apk --release --split-per-abi \
      --dart-define="API_BASE_URL=${API_BASE_URL}"
  )
  local apk_dir="$ROOT/apps/$app/build/app/outputs/flutter-apk"
  mkdir -p "$OUT/$name"
  cp -f "$apk_dir"/*.apk "$OUT/$name/" 2>/dev/null || true
  echo "    copied to dist/android/$name/"
  ls -lh "$OUT/$name/"
}

build_app mobile-family family
build_app mobile-admin admin

echo ""
echo "Done. Install on emulator:"
echo "  adb install -r dist/android/family/app-arm64-v8a-release.apk"
echo "  adb install -r dist/android/admin/app-arm64-v8a-release.apk"
echo ""
echo "API must be reachable at: ${API_BASE_URL}"
