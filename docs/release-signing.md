# Android upload-key signing

Play Console will not accept a debug-signed AAB. Each app
(`apps/mobile-family`, `apps/mobile-admin`) signs **release** builds from
`android/key.properties`. That file and the keystore are gitignored. Losing
the upload keystore means you cannot ship updates for that package name.

Do **not** generate this key on a shared machine or paste the passwords into
chat. Abhishek runs the command below once per app, then stores the `.jks`
offline (password manager + an encrypted copy off the laptop).

## 1. Create the upload keystore (local, once per app)

From the app's `android/` directory:

```bash
keytool -genkey -v \
  -keystore upload-keystore.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias upload
```

`keytool` will prompt for:

- **keystore password** → `storePassword` / GitHub `ANDROID_KEYSTORE_PASSWORD`
- **key password** → `keyPassword` / GitHub `ANDROID_KEY_PASSWORD` (use the same value unless you have a reason not to)
- **alias** → `upload` (must match `keyAlias`)
- Distinguished name — organisation is fine; this is not the Play listing

Create **two** keystores if family and admin stay on different application ids
(`com.schoolallways.family` and `com.schoolallways.admin`). They cannot share
an upload key if you ever want to transfer one app independently.

## 2. `android/key.properties` (never commit)

Place this next to `settings.gradle.kts` (`apps/mobile-family/android/key.properties`):

```
storeFile=upload-keystore.jks
storePassword=<keystore password>
keyAlias=upload
keyPassword=<key password>
```

`storeFile` is resolved from the `android/` directory. Put `upload-keystore.jks`
in that same folder.

A release build without this file **fails**. It does not fall back to the
debug keystore.

```bash
cd apps/mobile-family
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://api.school.techallways.com/v1
```

## 3. GitHub Actions secrets

CI builds a Play-uploadable AAB only when `ANDROID_KEYSTORE_BASE64` is set.
Forks and PRs without secrets still run `flutter analyze`, `flutter test`, and
`flutter build apk --debug`.

Repo **secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i upload-keystore.jks \| tr -d '\n'` |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` from `key.properties` |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | `keyPassword` from `key.properties` |

Repo **variable** (optional):

| Variable | Value |
|---|---|
| `MOBILE_API_BASE_URL` | `https://api.school.techallways.com/v1` |

If the variable is unset, CI uses that URL. Both apps read it via
`--dart-define=API_BASE_URL=...` (see `lib/core/providers.dart`).

If family and admin use **different** keystores, split the secrets
(`FAMILY_ANDROID_KEYSTORE_BASE64` / `ADMIN_…`) before the first Play upload —
do not rotate an already-enrolled upload key.

## 4. What happens if the keystore is lost

Google Play binds the app to the **upload key** you first enroll (or to the
Play App Signing key Google holds, with your upload key as the key you use
locally). If you lose `upload-keystore.jks` or its passwords:

- you cannot upload an update until Play support resets the upload key
- that reset is slow and not guaranteed on a timeline a school can wait for

Keep one encrypted backup that is not on the same disk as the laptop.

## 5. Local throwaway (CI graph only)

To prove Gradle fails closed, run a release build with `key.properties`
absent — it must error with a pointer at this file. To prove it succeeds,
copy a **throwaway** `.jks` into `android/` that you then delete. Never reuse
a throwaway key as the Play upload key.
