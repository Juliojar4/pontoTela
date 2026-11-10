plugins {
    id("com.android.application")
}

android {
    namespace = "br.com.pontotela.tv"
    compileSdk = 36

    defaultConfig {
        applicationId = "br.com.pontotela.tv"
        minSdk = 21 // TV box barata costuma rodar Android antigo
        targetSdk = 36
        versionCode = 4
        versionName = "1.3"
    }

    buildTypes {
        // ponytail: release assinado com a chave de debug -- serve pra sideload.
        // Pra Play Store, crie uma keystore propria.
        release { signingConfig = signingConfigs.getByName("debug") }
    }
}
