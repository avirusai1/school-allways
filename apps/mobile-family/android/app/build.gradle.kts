import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

val googleServicesFile = file("google-services.json")

android {
    namespace = "com.schoolallways.family"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.schoolallways.family"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storePassword = keystoreProperties.getProperty("storePassword")
                val storePath = keystoreProperties.getProperty("storeFile")
                storeFile = if (storePath.isNullOrBlank()) null else rootProject.file(storePath)
            }
        }
    }

    buildTypes {
        release {
            // Never fall back to debug. Missing key.properties fails the
            // release task graph below — debug APKs still build in CI.
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

gradle.taskGraph.whenReady {
    val needsReleaseKey = gradle.taskGraph.allTasks.any { task ->
        val n = task.name
        n.contains("Release") && (
            n.startsWith("assemble") ||
                n.startsWith("bundle") ||
                n.contains("AppBundle") ||
                n.contains("Aar") ||
                n.contains("Aab")
            )
    }
    if (needsReleaseKey && !keystorePropertiesFile.exists()) {
        throw GradleException(
            "Release builds need android/key.properties (storeFile, storePassword, keyAlias, keyPassword). " +
                "See docs/release-signing.md. This will not fall back to the debug keystore.",
        )
    }
    if (needsReleaseKey && !googleServicesFile.exists()) {
        throw GradleException(
            "Release builds need android/app/google-services.json. " +
                "See docs/push-setup.md. Debug APKs still build without it.",
        )
    }
}

if (googleServicesFile.exists()) {
    apply(plugin = "com.google.gms.google-services")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
