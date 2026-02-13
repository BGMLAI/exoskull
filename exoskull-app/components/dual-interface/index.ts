/**
 * Dual Interface — ExoSkull's TAU UX system
 *
 * Two always-visible panels with resizable split:
 * - Consciousness Stream (Chat + Forge) — left
 * - 6 Worlds Graph (Tree/Map) — right
 * - SplitHandle (Gamma Border) — between them
 */

export { DualInterface } from "./DualInterface";
export { ConsciousnessStream } from "./ConsciousnessStream";
export { WorldsGraph } from "./WorldsGraph";
export type { WorldNode, WorldLink, WorldNodeType } from "./WorldsGraph";
export { SplitHandle } from "./SplitHandle";

// Fractal visualization for completed goals
export { FractalPattern } from "./FractalPattern";
export type { FractalItem } from "./FractalPattern";

// Legacy export — TreeGraph is superseded by WorldsGraph
export { TreeGraph } from "./TreeGraph";
