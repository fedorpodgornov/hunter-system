plugins {
    id("com.android.application")
}

android {
    namespace = "ru.system.hunter"
    compileSdk = 34

    defaultConfig {
        applicationId = "ru.system.hunter"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        create("release") {
            storeFile = file("../keystore.jks")
            storePassword = "systemtracker"
            keyAlias = "system"
            keyPassword = "systemtracker"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
