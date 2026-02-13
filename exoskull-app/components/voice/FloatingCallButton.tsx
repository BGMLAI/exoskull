"use client";

/**
 * FloatingCallButton — Persistent voice call button across all dashboard pages
 *
 * Features:
 * - Always visible (bottom-right corner)
 * - Animated pulse when active
 * - Audio level ring visualization during call
 * - Adapts position on mobile (above bottom nav)
 * - Opens VoiceInterface panel
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Phone, X, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceInterface } from "./VoiceInterface";

interface FloatingCallButtonProps {
  tenantId: string;
}

export function FloatingCallButton({ tenantId }: FloatingCallButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggle = useCallback(() => {
    setIsOpen((v) => !v);
  }, []);

  // Simulate audio level when call panel is open (visual feedback)
  // In production this would be driven by actual audio AnalyserNode data
  useEffect(() => {
    if (isOpen) {
      // Listen for custom events from VoiceInterface about call state
      const handleCallState = (e: CustomEvent) => {
        setCallActive(e.detail?.active ?? false);
      };
      window.addEventListener(
        "exoskull:voice-state",
        handleCallState as EventListener,
      );

      return () => {
        window.removeEventListener(
          "exoskull:voice-state",
          handleCallState as EventListener,
        );
        if (levelIntervalRef.current) {
          clearInterval(levelIntervalRef.current);
          levelIntervalRef.current = null;
        }
      };
    } else {
      setCallActive(false);
      setAudioLevel(0);
    }
  }, [isOpen]);

  // Animate audio ring when call is active
  useEffect(() => {
    if (callActive) {
      levelIntervalRef.current = setInterval(() => {
        // Gentle breathing animation
        setAudioLevel(Math.random() * 0.6 + 0.2);
      }, 150);
    } else {
      if (levelIntervalRef.current) {
        clearInterval(levelIntervalRef.current);
        levelIntervalRef.current = null;
      }
      setAudioLevel(0);
    }

    return () => {
      if (levelIntervalRef.current) {
        clearInterval(levelIntervalRef.current);
      }
    };
  }, [callActive]);

  // Ring scale based on audio level (1.0 = button size, up to 1.5)
  const ringScale = 1 + audioLevel * 0.5;
  const ringOpacity = audioLevel * 0.4;

  return (
    <>
      {/* Voice overlay panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 animate-in fade-in slide-in-from-bottom-4 duration-200",
            // Mobile: above bottom nav bar + call button
            "bottom-36 right-4 md:bottom-24 md:right-6",
          )}
        >
          <VoiceInterface tenantId={tenantId} position="inline" />
        </div>
      )}

      {/* Audio level ring (behind button) */}
      {callActive && (
        <div
          className={cn(
            "fixed z-40 w-14 h-14 rounded-full bg-blue-500/30 pointer-events-none",
            // Match button position
            "bottom-[4.5rem] right-4 md:bottom-6 md:right-6",
          )}
          style={{
            transform: `scale(${ringScale})`,
            opacity: ringOpacity,
            transition: "transform 150ms ease-out, opacity 150ms ease-out",
          }}
        />
      )}

      {/* Floating button */}
      <button
        onClick={toggle}
        className={cn(
          // Mobile: position above bottom nav bar (bottom-16 = 4rem for nav)
          "fixed z-50 w-14 h-14 rounded-full flex items-center justify-center",
          "bottom-[4.5rem] right-4 md:bottom-6 md:right-6",
          "shadow-lg transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
          isOpen
            ? "bg-red-500 hover:bg-red-600 text-white"
            : callActive
              ? "bg-green-500 hover:bg-green-600 text-white animate-pulse"
              : "bg-blue-600 hover:bg-blue-700 text-white",
        )}
        title={isOpen ? "Zamknij rozmowe" : "Zadzwon do IORS"}
        aria-label={isOpen ? "Zamknij rozmowe" : "Zadzwon do IORS"}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : callActive ? (
          <PhoneCall className="w-6 h-6" />
        ) : (
          <Phone className="w-6 h-6" />
        )}
      </button>
    </>
  );
}
