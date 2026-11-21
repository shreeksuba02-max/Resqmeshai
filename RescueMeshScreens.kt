package org.rescuemesh.ai.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import org.rescuemesh.ai.ui.MainViewModel
import org.rescuemesh.ai.ui.theme.*

/**
 * Defines navigation routes for all 19 RescueMesh AI screens:
 * splash, onboarding, login, register, role_select, home, sos, category,
 * location, mesh_network, nearby_devices, shake_settings, emergency_status,
 * emergency_history, messages, profile, settings, offline_mode, help_about.
 */
@Composable
fun RescueMeshAppNav(viewModel: MainViewModel) {
    val navController = rememberNavController()
    val connectionState by viewModel.connectionState.collectAsState()
    val emergencies by viewModel.emergencies.collectAsState()
    val shakeDialog by viewModel.shakeDialogActive.collectAsState()

    Surface(modifier = Modifier.fillMaxSize(), color = NavyBackground) {
        NavHost(navController = navController, startDestination = "splash") {
            composable("splash") {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text("RescueMesh AI", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Spacer(Modifier.height(8.dp))
                    Text("OFFLINE. CONNECTED. ALIVE.", color = MeshCyan, fontSize = 13.sp)
                    Spacer(Modifier.height(28.dp))
                    Button(
                        onClick = { navController.navigate("home") },
                        colors = ButtonDefaults.buttonColors(containerColor = EmergencyRed)
                    ) {
                        Text("Enter Field Terminal")
                    }
                }
            }
            composable("onboarding") { SimpleScreenScaffold("Onboarding", "Store → Carry → Forward offline emergency architecture.") { navController.navigate("role_select") } }
            composable("login") { SimpleScreenScaffold("Sign In", "JWT authenticated Survivor, Relay Node, or Rescue Team login.") { navController.navigate("home") } }
            composable("register") { SimpleScreenScaffold("Register Device", "Create account & provision Android Keystore AES-256-GCM key.") { navController.navigate("home") } }
            composable("role_select") { SimpleScreenScaffold("Select Role", "SURVIVOR / RELAY_NODE / RESCUE_TEAM") { navController.navigate("home") } }

            composable("home") {
                Column(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text("RescueMesh AI", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("Status: $connectionState · Local Queue: ${emergencies.size}", color = MeshCyan, fontSize = 13.sp)
                    }

                    Button(
                        onClick = {
                            viewModel.createAndBroadcastSos(
                                userId = "usr-android-01",
                                category = "FLOOD_SUBMERSION",
                                latitude = 13.0067,
                                longitude = 80.2206,
                                description = "Immediate SOS triggered from Android handset",
                                victimCount = 2,
                                injured = true,
                                trapped = false
                            )
                            navController.navigate("emergency_status")
                        },
                        modifier = Modifier.size(180.dp),
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = EmergencyRed)
                    ) {
                        Text("SOS", fontSize = 32.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        TextButton(onClick = { navController.navigate("nearby_devices") }) { Text("Peers", color = MeshCyan) }
                        TextButton(onClick = { navController.navigate("emergency_history") }) { Text("History", color = MeshCyan) }
                        TextButton(onClick = { navController.navigate("shake_settings") }) { Text("Shake", color = MeshCyan) }
                        TextButton(onClick = { navController.navigate("settings") }) { Text("Settings", color = MeshCyan) }
                    }
                }
            }

            composable("sos") { SimpleScreenScaffold("SOS Alert Builder", "Captures GPS, AI severity features, and encrypts payload.") { navController.navigate("emergency_status") } }
            composable("category") { SimpleScreenScaffold("Emergency Category", "Collapse, Medical, Flood, Fire, Landslide, Shelter.") { navController.navigate("sos") } }
            composable("location") { SimpleScreenScaffold("GPS Location", "FusedLocationProvider coordinates with offline map cache.") { navController.popBackStack() } }
            composable("mesh_network") { SimpleScreenScaffold("Mesh Network", "Epidemic routing (SOS/Medical) & PRoPHET (Location/Chat).") { navController.popBackStack() } }
            composable("nearby_devices") { SimpleScreenScaffold("Nearby BLE & Wi-Fi Direct Devices", "Scanning for RescueMesh Service UUID 0000FE9F.") { navController.popBackStack() } }
            composable("shake_settings") { SimpleScreenScaffold("Shake-to-SOS Settings", "3-shake threshold & 3-second countdown. Lock-screen SOS is a future OS enhancement.") { navController.popBackStack() } }
            composable("emergency_status") { SimpleScreenScaffold("SOS Delivery Tracker", "SOS Created -> Stored Locally -> Nearby Received -> Forwarded -> Rescue Team Received -> Help Assigned") { navController.navigate("home") } }
            composable("emergency_history") { SimpleScreenScaffold("Emergency History", "Persisted Room Database SOS records: ${emergencies.size}") { navController.popBackStack() } }
            composable("messages") { SimpleScreenScaffold("Priority Mesh Messages", "1. SOS > 2. Medical > 3. Location > 4. Chat") { navController.popBackStack() } }
            composable("profile") { SimpleScreenScaffold("User Profile", "Role: ${viewModel.selectedRole.value}") { navController.popBackStack() } }
            composable("settings") { SimpleScreenScaffold("Settings", "Offline mode, WorkManager sync policy, AES-256-GCM key.") { navController.popBackStack() } }
            composable("offline_mode") { SimpleScreenScaffold("Offline Mode", "Stores SOS in Room Database until internet recovery.") { navController.popBackStack() } }
            composable("help_about") { SimpleScreenScaffold("Help & About (SIH26206)", "RescueMesh AI — Offline. Connected. Alive.") { navController.popBackStack() } }
        }

        if (shakeDialog) {
            AlertDialog(
                onDismissRequest = { viewModel.cancelShakeConfirmation() },
                title = { Text("Confirm Shake-to-SOS") },
                text = { Text("3 intentional shakes detected. Confirm to broadcast emergency SOS.") },
                confirmButton = {
                    Button(
                        onClick = {
                            viewModel.createAndBroadcastSos(
                                userId = "usr-android-01",
                                category = "GENERAL_SOS",
                                latitude = 13.0067,
                                longitude = 80.2206,
                                description = "Shake-to-SOS confirmed emergency",
                                victimCount = 1,
                                injured = true,
                                trapped = false
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = EmergencyRed)
                    ) { Text("Confirm SOS") }
                },
                dismissButton = {
                    TextButton(onClick = { viewModel.cancelShakeConfirmation() }) { Text("Cancel") }
                }
            )
        }
    }
}

@Composable
private fun SimpleScreenScaffold(title: String, subtitle: String, onAction: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Spacer(Modifier.height(10.dp))
        Text(subtitle, fontSize = 14.sp, color = Color(0xFFCBD5E1))
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onAction,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MeshCyan)
        ) {
            Text("Continue", color = Color(0xFF04101D))
        }
    }
}
