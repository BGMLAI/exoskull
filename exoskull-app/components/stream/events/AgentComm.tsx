"use client";

import { Bot } from "lucide-react";
import type { StreamEvent, AgentCommunicationData } from "@/lib/stream/types";

interface AgentCommProps {
  event: StreamEvent;
}

export function AgentComm({ event }: AgentCommProps) {
  const data = event.data as AgentCommunicationData;

  return (
    <div className="pl-3 border-l-2 border-l-muted-foreground/30 animate-in fade-in duration-300">
      <div className="flex items-center gap-1.5 mb-1">
        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {data.agentName}
        </span>
        {data.targetName && (
          <span className="text-xs text-muted-foreground">
            &rarr; {data.targetName}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {data.content}
      </p>
    </div>
  );
}
