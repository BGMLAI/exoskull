"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onTranscript?: (text: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "button";
  disabled?: boolean;
}

export function VoiceRecorder({
  onRecordingComplete,
  onTranscript,
  className,
  size = "md",
  variant = "icon",
  disabled = false,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const durationSec = (Date.now() - startTimeRef.current) / 1000;

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        setIsProcessing(true);

        // If transcript callback provided, transcribe first
        if (onTranscript) {
          try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");

            const response = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const { transcript } = await response.json();
              onTranscript(transcript);
            }
          } catch (e) {
            console.error("Transcription failed:", e);
          }
        }

        onRecordingComplete(audioBlob, durationSec);
        setIsProcessing(false);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);

      // Update duration timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast.error("Nie udalo sie uruchomic mikrofonu. Sprawdz uprawnienia.");
    }
  }, [onRecordingComplete, onTranscript]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setDuration(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const toggleRecording = () => {
    if (disabled && !isRecording) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  if (isProcessing) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn(sizeClasses[size], className)}
      >
        <Loader2 className={cn(iconSizes[size], "animate-spin")} />
      </Button>
    );
  }

  if (variant === "icon") {
    return (
      <Button
        variant={isRecording ? "destructive" : "ghost"}
        size="icon"
        onClick={toggleRecording}
        className={cn(
          sizeClasses[size],
          isRecording && "animate-pulse",
          disabled && !isRecording && "opacity-50 cursor-not-allowed",
          className,
        )}
        title={
          disabled && !isRecording
            ? "Poczekaj az AI skonczy mowic"
            : isRecording
              ? `Nagrywanie ${duration}s - kliknij by zatrzymac`
              : "Nagraj glosowo"
        }
      >
        {isRecording ? (
          <Square className={iconSizes[size]} />
        ) : (
          <Mic className={iconSizes[size]} />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant={isRecording ? "destructive" : "outline"}
      onClick={toggleRecording}
      className={cn(
        isRecording && "animate-pulse",
        disabled && !isRecording && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {isRecording ? (
        <>
          <Square className="h-4 w-4 mr-2" />
          Zatrzymaj ({duration}s)
        </>
      ) : (
        <>
          <Mic className="h-4 w-4 mr-2" />
          Nagraj
        </>
      )}
    </Button>
  );
}
