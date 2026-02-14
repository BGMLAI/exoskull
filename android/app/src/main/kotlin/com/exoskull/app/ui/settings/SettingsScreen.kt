package com.exoskull.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Settings") })

        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Sync status
            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("Sync Status") },
                    supportingContent = { Text(uiState.syncStatus) },
                    leadingContent = {
                        Icon(Icons.Default.Sync, contentDescription = null)
                    },
                )
            }

            // AI Engine
            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("AI Engine") },
                    supportingContent = {
                        Text(
                            if (uiState.onDeviceAiEnabled) "On-device (Gemma)"
                            else "Cloud only"
                        )
                    },
                    leadingContent = {
                        Icon(Icons.Default.Psychology, contentDescription = null)
                    },
                )
            }

            // Health Connect
            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("Health Connect") },
                    supportingContent = {
                        Text(
                            if (uiState.healthConnectEnabled) "Connected"
                            else "Not connected"
                        )
                    },
                    leadingContent = {
                        Icon(Icons.Default.FavoriteBorder, contentDescription = null)
                    },
                )
            }

            // Pending sync items
            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("Pending Changes") },
                    supportingContent = { Text("${uiState.pendingSyncCount} items") },
                    leadingContent = {
                        Icon(Icons.Default.CloudUpload, contentDescription = null)
                    },
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            // Sign out button
            OutlinedButton(
                onClick = viewModel::signOut,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.error,
                ),
            ) {
                Icon(Icons.Default.Logout, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out")
            }

            Text(
                text = "ExoSkull v0.1.0",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        }
    }
}
