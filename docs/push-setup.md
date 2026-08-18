# Push notifications (FCM)

Absentee alerts — the unpaid parent's reason to keep the app — go out over
Firebase Cloud Messaging. There is no per-message cost, so push does not
touch the school's comms budget. SMS and WhatsApp stay on the logging stub
until DLT / a BSP are contracted.

Do **not** commit `google-services.json` or the service-account private key.
They are gitignored, same as the upload keystore.

## 1. Create the Firebase project

1. Open [Firebase console](https://console.firebase.google.com/) with the
   School All Ways Google account.
2. Add a project (one project for both apps is fine). Disable Google
   Analytics if prompted — under-18 data, no analytics SDKs.
3. Add **two Android apps**:
   - Family: package name `com.schoolallways.family`
   - Admin: package name `com.schoolallways.admin`
4. Skip the optional SHA-1 for now (needed later for Play App Signing /
   Dynamic Links, not for FCM send).

## 2. `google-services.json` (never commit)

Download each app's `google-services.json` from Project settings → Your apps.

| App | Path |
|---|---|
| Family | `apps/mobile-family/android/app/google-services.json` |
| Admin | `apps/mobile-admin/android/app/google-services.json` |

Debug APKs (CI `flutter build apk --debug`) **build without** this file —
the Gradle plugin is applied only when it exists, and Firebase init is
caught at runtime so the app still launches. A **release** build without
the file fails with a pointer at this document, the same way missing
`key.properties` fails signing.

## 3. Service-account key → API env

In Firebase: Project settings → Service accounts → Generate new private
key. That JSON maps onto three API env vars (already in `.env.example`):

| JSON field | Env var |
|---|---|
| `project_id` | `FCM_PROJECT_ID` |
| `client_email` | `FCM_CLIENT_EMAIL` |
| `private_key` | `FCM_PRIVATE_KEY` |

`FCM_PRIVATE_KEY` is the PEM, including `-----BEGIN PRIVATE KEY-----` /
`-----END PRIVATE KEY-----`. In a `.env` file, keep it on one line with
literal `\n` for newlines; the API normalises those back to real newlines.

All three must be set. A blank `FCM_PRIVATE_KEY=` is treated as unset —
push then stays on the logging stub, which is the local-dev default.

Put the three values on the VPS (`saw-api.service` EnvironmentFile) when
you are ready to send real pushes. Do not put them in GitHub Actions for
the API; they belong on the box that runs the worker.

Restart the API after changing env. Boot log should say
`FCM configured — push channel uses Firebase Cloud Messaging.` If it still
warns that the three values are unset, the process did not pick up the
file (blank values, or the service was not restarted).

## 4. GitHub Actions secrets (mobile CI release builds)

CI cannot see your Mac's `google-services.json` — it's gitignored, so the
runner has neither file. The mobile CI job (`.github/workflows/ci.yml`)
decodes each app's file from a repo secret, the same pattern as the upload
keystores in `docs/release-signing.md`. **Per-app secret, per-app file** —
same reasoning as the keystores: one shared secret would silently put the
wrong app's Firebase config into the other app's build.

Repo **secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FAMILY_GOOGLE_SERVICES_JSON_BASE64` | `base64 -i apps/mobile-family/android/app/google-services.json \| tr -d '\n'` |
| `ADMIN_GOOGLE_SERVICES_JSON_BASE64` | `base64 -i apps/mobile-admin/android/app/google-services.json \| tr -d '\n'` |

The release-build step now requires **both** the keystore secret and this
one before it runs — signing an app without Firebase config would produce
something that installs but silently never receives push, which is worse
than the build just failing loudly. If either secret is missing, the
release step and the artifact-upload step both skip cleanly; the debug
build still runs regardless, so CI stays green for everything except the
one thing that's actually missing.

## 5. What this does not cover

- iOS (`GoogleService-Info.plist`, APNs key) — Android-only for the pilot.
- SMS (blocked on DLT entity + template approval).
- WhatsApp (blocked on a BSP contract + approved templates).
