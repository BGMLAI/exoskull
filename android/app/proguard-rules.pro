# ExoSkull ProGuard rules

# Keep Retrofit
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Keep Gson serialization
-keepclassmembers class com.exoskull.app.data.remote.dto.** { *; }
-keepclassmembers class com.exoskull.app.data.local.entity.** { *; }

# Keep Hilt
-keep class dagger.hilt.** { *; }

# Keep Room entities
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class * { *; }
