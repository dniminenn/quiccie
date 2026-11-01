plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.quiccie.android"
    compileSdk = 35
    buildFeatures { buildConfig = true }
    defaultConfig {
        applicationId = "app.quiccie.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 11
        versionName = "0.3.6-test"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    signingConfigs {
        create("release") {
            val location = System.getenv("QUICCIE_SIGNING_STORE")
            if (location != null) {
                storeFile = file(location)
                storePassword = System.getenv("QUICCIE_SIGNING_PASSWORD")
                keyAlias = "quiccie"
                keyPassword = System.getenv("QUICCIE_SIGNING_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.snakeyaml:snakeyaml-engine:2.9")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.test.espresso:espresso-web:3.6.1")
}

tasks.register("licenseArtifacts") {
    doLast {
        val artifacts =
            configurations
                .getByName("releaseRuntimeClasspath")
                .resolvedConfiguration
                .resolvedArtifacts
        for (artifact in artifacts) {
            val id = artifact.moduleVersion.id
            configurations.detachedConfiguration(dependencies.create("${id.group}:${id.name}:${id.version}@pom")).apply { isTransitive = false }.resolve()
        }
        val output = layout.buildDirectory.file("license-artifacts.tsv").get().asFile
        output.parentFile.mkdirs()
        output.writeText(
            artifacts.joinToString("\n") {
                "${it.moduleVersion.id.group}\t${it.name}\t${it.moduleVersion.id.version}\t${it.file.absolutePath}"
            } + "\n"
        )
    }
}
