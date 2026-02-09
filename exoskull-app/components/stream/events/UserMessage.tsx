"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StreamEvent,
  UserMessageData,
  UserVoiceData,
} from "@/lib/stream/types";

interface UserMessageProps {
  event: StreamEvent;
}

export function UserMessage({ event }: UserMessageProps) {
  const data = event.data as UserMessageData | UserVoiceData;
  const isVoice = data.type === "user_voice";
  const text = isVoice
    ? (data as UserVoiceData).transcript
    : (data as UserMessageData).content;

  return (
    <div className="flex justify-end animate-in fade-in slide-in-from-right-2 duration-200">
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 max-w-[80%]",
          "bg-primary text-primary-foreground",
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{text}</p>
        {isVoice && (
          <span className="text-xs opacity-60 mt-1 flex items-center gap-1">
            <Mic className="w-3 h-3" />
            glos
          </span>
        )}
      </div>
    </div>
  );
}
