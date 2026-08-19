#!/usr/bin/env bash
# One-off fix: apps/mobile-family/android/key.properties still has the
# literal "REPLACE_ME" placeholder from the original manual keytool setup —
# it was never actually filled in. Confirmed 2026-08-18 via a real build
# failure ("keystore password was incorrect"). Only mobile-family was
# affected; mobile-admin's key.properties was written correctly by
# scripts/create-upload-keystores.sh.
#
# This asks for the password ONCE, verifies it against the real keystore
# with `keytool -list` BEFORE writing anything, and aborts if it's wrong —
# so this cannot introduce a second mismatch.
set -euo pipefail

DIR="apps/mobile-family/android"
KS="$DIR/upload-keystore.jks"

if [ ! -f "$KS" ]; then
  echo "ERROR: $KS not found. Run this from the repo root." >&2
  exit 1
fi

echo "Enter the family app's upload keystore password"
echo "(the one that worked earlier with 'keytool -list -v')."
echo "Nothing will appear as you type — that is normal."
echo
read -r -s -p "Password: " PW
echo
echo

echo "Verifying against the real keystore..."
if ! keytool -list -keystore "$KS" -alias upload -storepass "$PW" >/dev/null 2>&1; then
  echo "ERROR: that password does not open the keystore. Nothing was changed." >&2
  unset PW
  exit 1
fi
echo "  ok — password verified against upload-keystore.jks"

cat > "$DIR/key.properties" <<EOF
storeFile=upload-keystore.jks
storePassword=$PW
keyAlias=upload
keyPassword=$PW
EOF
chmod 600 "$DIR/key.properties"
unset PW

echo
echo "Fixed: $DIR/key.properties now has the real password."
echo "Re-run ./scripts/build-android-release.sh to continue."
