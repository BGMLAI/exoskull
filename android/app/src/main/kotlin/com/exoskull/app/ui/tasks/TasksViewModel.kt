package com.exoskull.app.ui.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exoskull.app.data.local.dao.SyncQueueDao
import com.exoskull.app.data.local.dao.TaskDao
import com.exoskull.app.data.local.entity.SyncQueueEntity
import com.exoskull.app.data.local.entity.TaskEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

data class TasksUiState(
    val tasks: List<TaskEntity> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class TasksViewModel @Inject constructor(
    private val taskDao: TaskDao,
    private val syncQueueDao: SyncQueueDao,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TasksUiState())
    val uiState: StateFlow<TasksUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            taskDao.getAllTasks().collect { tasks ->
                _uiState.value = TasksUiState(tasks = tasks, isLoading = false)
            }
        }
    }

    fun addTask(title: String) {
        val now = Instant.now().toString()
        val task = TaskEntity(
            id = UUID.randomUUID().toString(),
            title = title,
            status = "pending",
            priority = 5,
            createdAt = now,
            updatedAt = now,
            isLocal = true,
        )

        viewModelScope.launch {
            taskDao.upsert(task)
            // Queue for sync
            syncQueueDao.insert(
                SyncQueueEntity(
                    tableName = "user_ops",
                    operation = "INSERT",
                    recordId = task.id,
                    payloadJson = """{"title":"${task.title}","status":"pending","priority":5}""",
                    createdAt = now,
                )
            )
        }
    }

    fun toggleTask(task: TaskEntity) {
        val newStatus = if (task.status == "completed") "pending" else "completed"
        val now = Instant.now().toString()
        val updated = task.copy(status = newStatus, updatedAt = now, isLocal = true)

        viewModelScope.launch {
            taskDao.upsert(updated)
            syncQueueDao.insert(
                SyncQueueEntity(
                    tableName = "user_ops",
                    operation = "UPDATE",
                    recordId = task.id,
                    payloadJson = """{"status":"$newStatus"}""",
                    createdAt = now,
                )
            )
        }
    }
}
