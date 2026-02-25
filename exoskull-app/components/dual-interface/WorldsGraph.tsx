"use client";

export interface WorldNode {
  name: string;
  worldId: string;
}

interface WorldsGraphProps {
  onChatAboutNode?: (node: WorldNode) => void;
}

export function WorldsGraph({ onChatAboutNode: _ }: WorldsGraphProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-black/10 p-4">
      <p className="text-sm text-zinc-400">6 Worlds Graph (WIP)</p>
    </div>
  );
}
