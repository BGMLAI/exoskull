package com.exoskull.app.ui.health

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exoskull.app.data.local.dao.HealthMetricDao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject

data class HealthUiState(
    val metrics: List<HealthMetricDisplay> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class HealthViewModel @Inject constructor(
    private val healthMetricDao: HealthMetricDao,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HealthUiState())
    val uiState: StateFlow<HealthUiState> = _uiState.asStateFlow()

    init {
        loadMetrics()
    }

    private fun loadMetrics() {
        val since = Instant.now().minus(1, ChronoUnit.DAYS).toString()

        viewModelScope.launch {
            healthMetricDao.getRecent(since).collect { entities ->
                val metrics = entities
                    .groupBy { it.metricType }
                    .map { (type, values) ->
                        val latest = values.first()
                        HealthMetricDisplay(
                            type = formatMetricType(type),
                            value = formatValue(latest.value, type),
                            unit = latest.unit ?: getDefaultUnit(type),
                            icon = getMetricIcon(type),
                            timestamp = latest.recordedAt,
                        )
                    }
                _uiState.value = HealthUiState(metrics = metrics, isLoading = false)
            }
        }
    }

    private fun formatMetricType(type: String): String = when (type) {
        "steps" -> "Steps"
        "heart_rate" -> "Heart Rate"
        "sleep" -> "Sleep"
        "weight" -> "Weight"
        "calories" -> "Calories"
        "distance" -> "Distance"
        "spo2" -> "Blood Oxygen"
        else -> type.replaceFirstChar { it.uppercase() }
    }

    private fun formatValue(value: Double, type: String): String = when (type) {
        "steps" -> value.toInt().toString()
        "sleep" -> String.format("%.1f", value / 60)
        else -> String.format("%.1f", value)
    }

    private fun getDefaultUnit(type: String): String = when (type) {
        "steps" -> "steps"
        "heart_rate" -> "bpm"
        "sleep" -> "hours"
        "weight" -> "kg"
        "calories" -> "kcal"
        "distance" -> "km"
        "spo2" -> "%"
        else -> ""
    }

    private fun getMetricIcon(type: String) = when (type) {
        "steps" -> Icons.Default.DirectionsWalk
        "heart_rate" -> Icons.Default.Favorite
        "sleep" -> Icons.Default.Bedtime
        "weight" -> Icons.Default.MonitorWeight
        "calories" -> Icons.Default.LocalFireDepartment
        "distance" -> Icons.Default.StraightenOutlined
        "spo2" -> Icons.Default.Air
        else -> Icons.Default.BarChart
    }
}
