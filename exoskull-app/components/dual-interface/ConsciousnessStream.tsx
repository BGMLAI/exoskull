"use client";

interface ConsciousnessStreamProps {
  iorsName?: string;
}

export function ConsciousnessStream({ iorsName }: ConsciousnessStreamProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-black/20 p-4">
      <p className="text-sm text-zinc-400">
        {iorsName || "IORS"} — Consciousness Stream (WIP)
      </p>
    </div>
  );
}
