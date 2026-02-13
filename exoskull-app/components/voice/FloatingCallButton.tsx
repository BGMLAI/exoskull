"use client";

import { useState, useCallback } from "react";
import { Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceInterface } from "./VoiceInterface";

interface FloatingCallButtonProps {
  tenantId: string;
}

export function FloatingCallButton({ tenantId }: FloatingCallButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((v) => !v);
  }, []);

  return (
    <>
      {/* Voice overlay panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <VoiceInterface tenantId={tenantId} position="inline" />
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={toggle}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center",
          "shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
          isOpen
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white",
        )}
        title={isOpen ? "Zamknij rozmowe" : "Zadzwon do IORS"}
        aria-label={isOpen ? "Zamknij rozmowe" : "Zadzwon do IORS"}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
      </button>
    </>
  );
}
