package com.exoskull.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// ExoSkull brand colors — dark-first design
private val ExoPrimary = Color(0xFF8B5CF6)      // Purple
private val ExoSecondary = Color(0xFF06B6D4)     // Cyan
private val ExoTertiary = Color(0xFFF59E0B)      // Amber
private val ExoError = Color(0xFFEF4444)         // Red
private val ExoSurface = Color(0xFF0F0F1A)       // Near-black
private val ExoSurfaceVariant = Color(0xFF1A1A2E) // Dark navy
private val ExoBackground = Color(0xFF070710)     // Deep black
private val ExoOnSurface = Color(0xFFE2E8F0)     // Light gray

private val DarkColorScheme = darkColorScheme(
    primary = ExoPrimary,
    secondary = ExoSecondary,
    tertiary = ExoTertiary,
    error = ExoError,
    background = ExoBackground,
    surface = ExoSurface,
    surfaceVariant = ExoSurfaceVariant,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = ExoOnSurface,
    onSurface = ExoOnSurface,
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF334155),
)

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF7C3AED),
    secondary = Color(0xFF0891B2),
    tertiary = Color(0xFFD97706),
    error = Color(0xFFDC2626),
    background = Color(0xFFF8FAFC),
    surface = Color.White,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onBackground = Color(0xFF0F172A),
    onSurface = Color(0xFF0F172A),
)

@Composable
fun ExoSkullTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content
    )
}
