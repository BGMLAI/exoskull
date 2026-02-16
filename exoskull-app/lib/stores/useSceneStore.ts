import { create } from "zustand";

export type SceneEffect =
  | "idle"
  | "thinking" // violet pulse
  | "building" // amber pulse
  | "searching" // cyan pulse
  | "executing"; // green pulse

interface ActiveTool {
  name: string;
  startedAt: number;
}

interface SceneState {
  /** Current visual effect (drives bloom color/intensity) */
  effect: SceneEffect;
  /** Currently running tool (if any) */
  activeTool: ActiveTool | null;
  /** Bloom intensity multiplier (1.0 = normal, >1.0 = pulse) */
  bloomPulse: number;
  /** Particle burst trigger counter (increments on each burst) */
  particleBurst: number;

  // Actions
  setEffect: (effect: SceneEffect) => void;
  startTool: (name: string) => void;
  endTool: () => void;
  triggerBloomPulse: (intensity?: number) => void;
  triggerParticleBurst: () => void;
}

/**
 * Zustand store bridging SSE tool events → 3D scene visual effects.
 * UnifiedStream dispatches tool_start/tool_end → store updates →
 * SceneEffects R3F component reads and animates.
 */
export const useSceneStore = create<SceneState>((set) => ({
  effect: "idle",
  activeTool: null,
  bloomPulse: 1.0,
  particleBurst: 0,

  setEffect: (effect) => set({ effect }),

  startTool: (name) => {
    const lower = name.toLowerCase();
    let effect: SceneEffect = "executing";
    if (lower.includes("search") || lower.includes("fetch"))
      effect = "searching";
    else if (lower.includes("build") || lower.includes("app"))
      effect = "building";

    set({
      activeTool: { name, startedAt: Date.now() },
      effect,
      bloomPulse: 1.6,
    });
  },

  endTool: () =>
    set({
      activeTool: null,
      effect: "idle",
      bloomPulse: 1.0,
    }),

  triggerBloomPulse: (intensity = 2.0) => set({ bloomPulse: intensity }),

  triggerParticleBurst: () =>
    set((s) => ({ particleBurst: s.particleBurst + 1 })),
}));
