/**
 * VAPI Voice Chat Widget for IORS Landing Page
 *
 * Features:
 * - Floating voice chat button
 * - In-browser voice conversation with VAPI
 * - Real-time transcription display
 * - Call state management (idle, connecting, active, ended)
 * - Automatic data sync to Supabase
 *
 * VAPI Assistant: First Contact (10-minute free call)
 */

(function() {
  'use strict';

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  const VAPI_CONFIG = {
    publicKey: '4b5abdd4-333f-4914-9549-0fe6576ad301', // VAPI Public Key
    assistantId: 'adf258e0-3a41-444e-b683-38c195bd7954', // First Contact Assistant
    supabaseUrl: 'https://ocixoxjozzldqldadrip.supabase.co',
    // Note: Phone number will be captured from VAPI or set to anonymous
  };

  // ==========================================================================
  // VAPI CLIENT INITIALIZATION
  // ==========================================================================

  let vapiInstance = null;
  let callActive = false;
  let transcriptBuffer = [];

  function initVapi() {
    // Check if Vapi SDK is loaded
    if (typeof window.Vapi === 'undefined') {
      console.error('VAPI SDK not loaded');
      return null;
    }

    vapiInstance = new window.Vapi(VAPI_CONFIG.publicKey);

    // Event listeners
    vapiInstance.on('call-start', handleCallStart);
    vapiInstance.on('call-end', handleCallEnd);
    vapiInstance.on('speech-start', handleSpeechStart);
    vapiInstance.on('speech-end', handleSpeechEnd);
    vapiInstance.on('message', handleMessage);
    vapiInstance.on('error', handleError);

    console.log('✅ VAPI initialized');
    return vapiInstance;
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  function handleCallStart() {
    console.log('📞 Call started');
    callActive = true;
    transcriptBuffer = [];

    updateWidgetState('active');
    showTranscriptPanel();

    // Track event
    if (window.trackEvent) {
      window.trackEvent('vapi_call_started', {
        assistant_id: VAPI_CONFIG.assistantId
      });
    }
  }

  function handleCallEnd() {
    console.log('📴 Call ended');
    callActive = false;

    updateWidgetState('ended');

    // Show call summary
    showCallSummary();

    // Track event
    if (window.trackEvent) {
      window.trackEvent('vapi_call_ended', {
        assistant_id: VAPI_CONFIG.assistantId,
        duration: transcriptBuffer.length
      });
    }

    // Auto-hide transcript after 10 seconds
    setTimeout(() => {
      hideTranscriptPanel();
      updateWidgetState('idle');
    }, 10000);
  }

  function handleSpeechStart() {
    console.log('🎤 User started speaking');
    setUserSpeaking(true);
  }

  function handleSpeechEnd() {
    console.log('🔇 User stopped speaking');
    setUserSpeaking(false);
  }

  function handleMessage(message) {
    console.log('💬 Message:', message);

    // Add to transcript
    if (message.type === 'transcript' && message.transcriptType === 'final') {
      const entry = {
        timestamp: new Date().toISOString(),
        role: message.role, // 'user' or 'assistant'
        text: message.transcript
      };
      transcriptBuffer.push(entry);
      displayTranscript(entry);
    }
  }

  function handleError(error) {
    console.error('❌ VAPI Error:', error);
    alert('Przepraszamy, wystąpił błąd z połączeniem. Spróbuj ponownie.');
    updateWidgetState('idle');
  }

  // ==========================================================================
  // UI FUNCTIONS
  // ==========================================================================

  function updateWidgetState(state) {
    const button = document.getElementById('vapiWidgetButton');
    const icon = document.getElementById('vapiWidgetIcon');
    const pulse = document.getElementById('vapiWidgetPulse');

    if (!button) return;

    // Remove all state classes
    button.classList.remove('idle', 'active', 'connecting', 'ended');
    button.classList.add(state);

    // Update icon
    switch (state) {
      case 'idle':
        icon.textContent = '🎙️';
        pulse.style.display = 'none';
        break;
      case 'connecting':
        icon.textContent = '⏳';
        pulse.style.display = 'block';
        break;
      case 'active':
        icon.textContent = '📞';
        pulse.style.display = 'block';
        break;
      case 'ended':
        icon.textContent = '✅';
        pulse.style.display = 'none';
        break;
    }
  }

  function showTranscriptPanel() {
    let panel = document.getElementById('vapiTranscriptPanel');

    if (!panel) {
      panel = createTranscriptPanel();
      document.body.appendChild(panel);
    }

    panel.classList.add('visible');
  }

  function hideTranscriptPanel() {
    const panel = document.getElementById('vapiTranscriptPanel');
    if (panel) {
      panel.classList.remove('visible');
    }
  }

  function displayTranscript(entry) {
    const panel = document.getElementById('vapiTranscriptPanel');
    if (!panel) return;

    const messagesContainer = panel.querySelector('.transcript-messages');
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `transcript-message ${entry.role}`;
    messageEl.innerHTML = `
      <span class="transcript-role">${entry.role === 'user' ? 'Ty' : 'IORS'}</span>
      <span class="transcript-text">${entry.text}</span>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function setUserSpeaking(speaking) {
    const panel = document.getElementById('vapiTranscriptPanel');
    if (panel) {
      if (speaking) {
        panel.classList.add('user-speaking');
      } else {
        panel.classList.remove('user-speaking');
      }
    }
  }

  function showCallSummary() {
    const panel = document.getElementById('vapiTranscriptPanel');
    if (!panel) return;

    const summary = document.createElement('div');
    summary.className = 'call-summary';
    summary.innerHTML = `
      <h3>Rozmowa zakończona ✅</h3>
      <p>Dziękujemy za rozmowę! Skontaktujemy się wkrótce.</p>
      <button class="call-summary-close" onclick="document.getElementById('vapiTranscriptPanel').classList.remove('visible')">
        Zamknij
      </button>
    `;

    const messagesContainer = panel.querySelector('.transcript-messages');
    messagesContainer.appendChild(summary);
  }

  // ==========================================================================
  // WIDGET CREATION
  // ==========================================================================

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'vapiWidget';
    widget.className = 'vapi-widget';
    widget.innerHTML = `
      <button id="vapiWidgetButton" class="vapi-widget-button idle" aria-label="Rozpocznij rozmowę głosową">
        <span id="vapiWidgetIcon" class="vapi-widget-icon">🎙️</span>
        <span id="vapiWidgetPulse" class="vapi-widget-pulse"></span>
      </button>
      <div class="vapi-widget-tooltip">Porozmawiaj z IORS</div>
    `;

    document.body.appendChild(widget);

    // Add click handler
    const button = document.getElementById('vapiWidgetButton');
    button.addEventListener('click', handleWidgetClick);
  }

  function createTranscriptPanel() {
    const panel = document.createElement('div');
    panel.id = 'vapiTranscriptPanel';
    panel.className = 'vapi-transcript-panel';
    panel.innerHTML = `
      <div class="transcript-header">
        <h3>Rozmowa z IORS</h3>
        <button class="transcript-close" onclick="document.getElementById('vapiTranscriptPanel').classList.remove('visible')">×</button>
      </div>
      <div class="transcript-messages"></div>
      <div class="transcript-status">
        <span class="status-indicator"></span>
        <span class="status-text">Połączony</span>
      </div>
    `;

    return panel;
  }

  // ==========================================================================
  // CALL MANAGEMENT
  // ==========================================================================

  function handleWidgetClick() {
    if (callActive) {
      // End call
      endCall();
    } else {
      // Start call
      startCall();
    }
  }

  function startCall() {
    if (!vapiInstance) {
      alert('Przepraszamy, widget rozmów nie jest dostępny. Spróbuj odświeżyć stronę.');
      return;
    }

    updateWidgetState('connecting');

    // Start call with VAPI
    vapiInstance.start(VAPI_CONFIG.assistantId);

    // Track event
    if (window.trackEvent) {
      window.trackEvent('vapi_call_initiated', {
        source: 'landing_page_widget'
      });
    }
  }

  function endCall() {
    if (!vapiInstance || !callActive) return;

    vapiInstance.stop();
    updateWidgetState('idle');

    // Track event
    if (window.trackEvent) {
      window.trackEvent('vapi_call_manually_ended', {});
    }
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  function init() {
    // Wait for VAPI SDK to load
    const checkVapiLoaded = setInterval(() => {
      if (typeof window.Vapi !== 'undefined') {
        clearInterval(checkVapiLoaded);

        // Initialize VAPI
        initVapi();

        // Create widget
        createWidget();

        console.log('✅ VAPI Widget ready');
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkVapiLoaded);
      if (!vapiInstance) {
        console.error('❌ VAPI SDK failed to load');
      }
    }, 10000);
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose functions globally for debugging
  window.vapiWidget = {
    start: startCall,
    end: endCall,
    getTranscript: () => transcriptBuffer,
    isActive: () => callActive
  };

})();
