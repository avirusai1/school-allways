#!/usr/bin/env bash
# =============================================================================
# Creates the Play upload keystores for both mobile apps, plus their
# key.properties files.
#
#   bash scripts/create-upload-keystores.sh
#
# You choose the password. It is asked for once, hidden, and never printed,
# never logged, and never leaves this machine. Put it in your password manager
# BEFORE you run this — there is no recovery from inside the script.
#
# Safe to re-run: it refuses to overwrite an existing keystore rather than
# silently replacing one you have already enrolled with Play.
#
# See docs/release-signing.md for what these files are and why they matter.
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS=(mobile-family mobile-admin)

# --- 0. Preflight -----------------------------------------------------------

if ! command -v keytool >/dev/null 2>&1; then
  cat >&2 <<'MSG'
ERROR: `keytool` is not installed.

It ships with a Java JDK. On a Mac:

    brew install --cask temurin

Then close and reopen Terminal and run this script again.
MSG
  exit 1
fi

# Skip apps that already have a keystore rather than aborting the whole run.
# Overwriting a keystore that has already been enrolled with Play would cost
# you a 1-2 day upload-key reset, so an existing file is never touched — but a
# half-finished first run should be resumable without deleting anything.
TODO=()
for app in "${APPS[@]}"; do
  if [ -f "$REPO_ROOT/apps/$app/android/upload-keystore.jks" ]; then
    echo "skip  $app — upload-keystore.jks already exists, leaving it alone"
  else
    TODO+=("$app")
  fi
done

if [ ${#TODO[@]} -eq 0 ]; then
  echo
  echo "Both apps already have keystores. Nothing to do."
  echo "To verify one:"
  echo "  keytool -list -v -keystore apps/mobile-family/android/upload-keystore.jks -alias upload"
  exit 0
fi

echo
echo "Creating upload keystores for: ${TODO[*]}"
echo

# --- 1. Password ------------------------------------------------------------

echo "Choose a keystore password (at least 6 characters)."
echo "Nothing will appear as you type — that is normal."
echo

read -r -s -p "Password: " PW
echo
read -r -s -p "Confirm:  " PW2
echo
echo

if [ "$PW" != "$PW2" ]; then
  echo "ERROR: passwords did not match. Nothing was created." >&2
  exit 1
fi

if [ ${#PW} -lt 6 ]; then
  echo "ERROR: keytool requires at least 6 characters. Nothing was created." >&2
  exit 1
fi

# --- 2. Generate ------------------------------------------------------------

# -dname supplies the certificate fields non-interactively. These are internal
# identifiers on the signing certificate; they are NOT your Play Store listing
# and are never shown to a parent or a school.
DNAME="CN=School All Ways, OU=Engineering, O=School All Ways, L=Unknown, ST=Unknown, C=IN"

for app in "${TODO[@]}"; do
  dir="$REPO_ROOT/apps/$app/android"
  ks="$dir/upload-keystore.jks"

  echo "→ $app"

  # Each app gets its OWN keystore. They must not share an upload key, so that
  # one app can later be transferred or re-signed without touching the other.
  keytool -genkeypair -v \
    -keystore "$ks" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -alias upload \
    -dname "$DNAME" \
    -storepass "$PW" \
    -keypass "$PW" \
    >/dev/null

  chmod 600 "$ks"

  # Gradle reads the password from this file in plaintext — that is how the
  # Android toolchain works. It is gitignored (.gitignore lines 40-47) and
  # chmod 600. It must never be committed or copied off this machine.
  umask 077
  cat > "$dir/key.properties" <<EOF
storeFile=upload-keystore.jks
storePassword=$PW
keyAlias=upload
keyPassword=$PW
EOF
  chmod 600 "$dir/key.properties"

  echo "  created upload-keystore.jks + key.properties"
done

unset PW PW2

# --- 3. Verify --------------------------------------------------------------

echo
echo "Verifying…"

fail=0
for app in "${APPS[@]}"; do
  for f in upload-keystore.jks key.properties; do
    if [ -f "$REPO_ROOT/apps/$app/android/$f" ]; then
      echo "  ok   apps/$app/android/$f"
    else
      echo "  MISSING apps/$app/android/$f" >&2
      fail=1
    fi
  done
done

# The important check: git must not be able to see any of it.
if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  leaked="$(git -C "$REPO_ROOT" status --porcelain | grep -iE 'jks|key\.properties' || true)"
  if [ -n "$leaked" ]; then
    echo >&2
    echo "DANGER: git can see these files. Do NOT commit. Fix .gitignore first:" >&2
    echo "$leaked" >&2
    fail=1
  else
    echo "  ok   git is correctly ignoring both keystores"
  fi
else
  echo "  note: not a git repo here, skipped the ignore check"
fi

[ "$fail" -eq 0 ] || exit 1

cat <<'MSG'

Done.

Two things to do right now, before you forget:

  1. Save the password in your password manager.
  2. Copy BOTH upload-keystore.jks files somewhere off this laptop
     (encrypted cloud folder, or a password manager file attachment).
     Not the same disk.

Losing them is recoverable via a Play upload-key reset, but that takes
1-2 business days — bad timing if a school is waiting on a fix.

Next: the four GitHub secrets. To print the base64 of a keystore:

  base64 -i apps/mobile-family/android/upload-keystore.jks | tr -d '\n'

MSG
