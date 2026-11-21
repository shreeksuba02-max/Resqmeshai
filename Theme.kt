package org.rescuemesh.ai.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val NavyBackground = Color(0xFF07111F)
val NavySurface = Color(0xFF0D1B2E)
val NavyElevated = Color(0xFF15253E)
val EmergencyRed = Color(0xFFEF4444)
val MeshCyan = Color(0xFF06B6D4)
val StatusGreen = Color(0xFF10B981)
val StatusAmber = Color(0xFFF59E0B)

private val RescueColorScheme = darkColorScheme(
    primary = MeshCyan,
    secondary = EmergencyRed,
    background = NavyBackground,
    surface = NavySurface,
    onPrimary = Color(0xFF04101D),
    onSecondary = Color.White,
    onBackground = Color(0xFFF1F5F9),
    onSurface = Color(0xFFF1F5F9)
)

@Composable
fun RescueMeshTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RescueColorScheme,
        content = content
    )
}
