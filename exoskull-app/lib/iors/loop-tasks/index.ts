/**
 * Pętla Sub-Loop Handlers — Registry
 *
 * Maps sub_loop names to their handler functions.
 */

export { handleEmergency } from "./emergency";
export { handleOutbound } from "./outbound";
export { handleProactive } from "./proactive";
export { handleObservation } from "./observation";
export { handleOptimization } from "./optimization";
export { handleMaintenance } from "./maintenance";

import type { SubLoop, SubLoopHandler } from "@/lib/iors/loop-types";
import type { PetlaWorkItem, SubLoopResult } from "@/lib/iors/loop-types";

import { logger } from "@/lib/logger";
/**
 * Dispatch a work item to the appropriate sub-loop handler.
 */
export async function dispatchToHandler(
  item: PetlaWorkItem,
): Promise<SubLoopResult> {
  switch (item.sub_loop) {
    case "emergency": {
      const { handleEmergency } = await import("./emergency");
      return handleEmergency(item);
    }
    case "outbound": {
      const { handleOutbound } = await import("./outbound");
      return handleOutbound(item);
    }
    case "proactive": {
      const { handleProactive } = await import("./proactive");
      return handleProactive(item);
    }
    case "observation": {
      const { handleObservation } = await import("./observation");
      return handleObservation(item);
    }
    case "optimization": {
      const { handleOptimization } = await import("./optimization");
      return handleOptimization(item);
    }
    case "maintenance": {
      const { handleMaintenance } = await import("./maintenance");
      return handleMaintenance(item);
    }
    default:
      logger.warn("[Petla] Unknown sub_loop:", item.sub_loop);
      return { handled: false, error: `Unknown sub_loop: ${item.sub_loop}` };
  }
}
