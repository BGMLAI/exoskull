import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvent } from "./useTauriEvent";

interface MouseEvent {
  action: string;
  button: number;
}

export function useAssistant() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const mouseEvent = useTauriEvent<MouseEvent | null>("mouse-event", null);

  useEffect(() => {
    if (!mouseEvent) return;

    switch (mouseEvent.action) {
      case "dictation_start":
        startDictation();
        break;
      case "dictation_stop":
        stopDictation();
        break;
      case "tts":
        readSelectedText();
        break;
      case "chat":
        setShowChat((prev) => !prev);
        break;
    }
  }, [mouseEvent]);

  const startDictation = useCallback(async () => {
    setIsRecording(true);
    try {
      await invoke("start_dictation");
    } catch (err) {
      console.error("Dictation start failed:", err);
      setIsRecording(false);
    }
  }, []);

  const stopDictation = useCallback(async () => {
    try {
      const text = await invoke<string>("stop_dictation");
      // Text will be pasted at cursor by Rust side
      console.log("Transcribed:", text);
    } catch (err) {
      console.error("Dictation stop failed:", err);
    } finally {
      setIsRecording(false);
    }
  }, []);

  const readSelectedText = useCallback(async () => {
    setIsSpeaking(true);
    try {
      // Get clipboard content and speak it
      const text = await navigator.clipboard.readText();
      if (text) {
        await invoke("speak_text", { text });
      }
    } catch (err) {
      console.error("TTS failed:", err);
    } finally {
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(async () => {
    try {
      await invoke("stop_speaking");
    } catch (err) {
      console.error("Stop speaking failed:", err);
    } finally {
      setIsSpeaking(false);
    }
  }, []);

  return {
    isRecording,
    isSpeaking,
    showChat,
    setShowChat,
    startDictation,
    stopDictation,
    readSelectedText,
    stopSpeaking,
  };
}
