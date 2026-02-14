package com.exoskull.app.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    data object Chat : Screen("chat", "Chat", Icons.Default.Chat)
    data object Dashboard : Screen("dashboard", "Home", Icons.Default.Dashboard)
    data object Tasks : Screen("tasks", "Tasks", Icons.Default.CheckCircle)
    data object Health : Screen("health", "Health", Icons.Default.FavoriteBorder)
    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
}

sealed class TopScreen(val route: String) {
    data object Login : TopScreen("login")
    data object Main : TopScreen("main")
    data object Voice : TopScreen("voice")
    data object Knowledge : TopScreen("knowledge")
}

val bottomNavItems = listOf(
    Screen.Dashboard,
    Screen.Chat,
    Screen.Tasks,
    Screen.Health,
    Screen.Settings,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavGraph() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = TopScreen.Login.route) {
        composable(TopScreen.Login.route) {
            com.exoskull.app.ui.settings.LoginScreen(
                onLoginSuccess = {
                    navController.navigate(TopScreen.Main.route) {
                        popUpTo(TopScreen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(TopScreen.Main.route) {
            MainScaffold()
        }
    }
}

@Composable
fun MainScaffold() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                bottomNavItems.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.title) },
                        label = { Text(screen.title) },
                        selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Dashboard.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Dashboard.route) {
                com.exoskull.app.ui.dashboard.DashboardScreen()
            }
            composable(Screen.Chat.route) {
                com.exoskull.app.ui.chat.ChatScreen()
            }
            composable(Screen.Tasks.route) {
                com.exoskull.app.ui.tasks.TasksScreen()
            }
            composable(Screen.Health.route) {
                com.exoskull.app.ui.health.HealthScreen()
            }
            composable(Screen.Settings.route) {
                com.exoskull.app.ui.settings.SettingsScreen()
            }
        }
    }
}
