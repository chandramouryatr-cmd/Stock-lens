plugins {
    id("com.android.application")
    id("com.chaquo.python")
}

android {
    namespace = "com.stocklens.app"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }
    defaultConfig {
        applicationId = "com.stocklens.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        ndk {
            abiFilters += listOf("arm64-v8a")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

chaquopy {
    defaultConfig {
        version = "3.10"
        pip {
            install("requests")
            install("beautifulsoup4")
            install("lxml")
        }
        // The web page files must exist as real files so the local server can send them.
        extractPackages("slweb")
    }
    sourceSets {
        getByName("main") {
            srcDir(layout.buildDirectory.dir("stocklens-py"))
        }
    }
}

// The phone app runs the same Python and web page as the PC version:
// copy ../app and ../static in before every build, so there is only one copy to edit.
val syncStockLens by tasks.registering(Sync::class) {
    from("../../app") {
        into("app")
        exclude("__pycache__/**", "*.pyc")
    }
    from("../../static") {
        into("slweb/static")
    }
    from("../python") // android_main.py and slweb/__init__.py: the phone-only start-up code
    into(layout.buildDirectory.dir("stocklens-py"))
}
tasks.named("preBuild") { dependsOn(syncStockLens) }
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("PythonSources") }.configureEach { dependsOn(syncStockLens) }
