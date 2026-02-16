"use client";

import { create } from "zustand";

export interface SpatialMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface SpatialChatState {
  messages: SpatialMessage[];
  /** Push a new message (or update existing if same id) */
  pushMessage: (msg: SpatialMessage) => void;
  /** Update content of an existing message (for streaming) */
  updateMessage: (id: string, content: string, isStreaming?: boolean) => void;
  /** Clear all messages */
  clear: () => void;
}

const MAX_SPATIAL_MESSAGES = 10;

export const useSpatialChatStore = create<SpatialChatState>((set) => ({
  messages: [],
  pushMessage: (msg) =>
    set((s) => {
      // If message with same id exists, update it
      const existing = s.messages.find((m) => m.id === msg.id);
      if (existing) {
        return {
          messages: s.messages.map((m) => (m.id === msg.id ? msg : m)),
        };
      }
      // Add new, keep last MAX
      const updated = [...s.messages, msg];
      return { messages: updated.slice(-MAX_SPATIAL_MESSAGES) };
    }),
  updateMessage: (id, content, isStreaming) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id
          ? {
              ...m,
              content,
              ...(isStreaming !== undefined ? { isStreaming } : {}),
            }
          : m,
      ),
    })),
  clear: () => set({ messages: [] }),
}));
