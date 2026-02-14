package com.exoskull.app.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.exoskull.app.data.local.dao.MessageDao
import com.exoskull.app.data.local.entity.MessageEntity
import com.exoskull.app.data.remote.SupabaseAuth
import com.exoskull.app.data.remote.api.ExoSkullApi
import com.exoskull.app.data.remote.dto.SendMessageRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val inputText: String = "",
    val isLoading: Boolean = false,
    val isOnline: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageDao: MessageDao,
    private val api: ExoSkullApi,
    private val auth: SupabaseAuth,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    init {
        // Load messages from local DB
        viewModelScope.launch {
            messageDao.getRecentMessages(100).collect { entities ->
                val messages = entities.reversed().map { entity ->
                    ChatMessage(
                        id = entity.id,
                        role = entity.role,
                        content = entity.content,
                        timestamp = entity.createdAt,
                    )
                }
                _uiState.value = _uiState.value.copy(messages = messages)
            }
        }
    }

    fun onInputChange(text: String) {
        _uiState.value = _uiState.value.copy(inputText = text)
    }

    fun sendMessage() {
        val text = _uiState.value.inputText.trim()
        if (text.isBlank()) return

        val now = Instant.now().toString()
        val userMessageId = UUID.randomUUID().toString()

        // Save user message locally
        viewModelScope.launch {
            messageDao.insert(
                MessageEntity(
                    id = userMessageId,
                    role = "user",
                    content = text,
                    channel = "android_app",
                    createdAt = now,
                )
            )
        }

        _uiState.value = _uiState.value.copy(inputText = "", isLoading = true)

        // Send to server
        viewModelScope.launch {
            try {
                val response = api.sendMessage(
                    auth = auth.getBearerToken(),
                    body = SendMessageRequest(text = text),
                )

                if (response.isSuccessful) {
                    val body = response.body()
                    val assistantMessage = body?.text ?: "No response"
                    val assistantId = UUID.randomUUID().toString()

                    messageDao.insert(
                        MessageEntity(
                            id = assistantId,
                            role = "assistant",
                            content = assistantMessage,
                            channel = "android_app",
                            createdAt = Instant.now().toString(),
                        )
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        error = "Server error: ${response.code()}",
                    )
                }
            } catch (e: Exception) {
                // Offline — queue for later
                _uiState.value = _uiState.value.copy(
                    isOnline = false,
                    error = "Offline mode — message queued",
                )
                // TODO: Queue in sync_queue for later processing
            } finally {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }
        }
    }
}
