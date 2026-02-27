# AgentDeck ProGuard rules

# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class dev.agentdeck.**$$serializer { *; }
-keepclassmembers class dev.agentdeck.** {
    *** Companion;
}
-keepclasseswithmembers class dev.agentdeck.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# ML Kit Barcode
-keep class com.google.mlkit.** { *; }
