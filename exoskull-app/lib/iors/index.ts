/**
 * IORS — Barrel Export
 *
 * Core module for the IORS (Instancja AI agenta) system.
 * Import from '@/lib/iors' for all IORS-related functionality.
 */

export * from "./types";
export {
  getPersonalityPromptFragment,
  parsePersonalityFromDB,
} from "./personality";
export { isBirthPending, handleBirthMessage } from "./birth-flow";
export {
  BIRTH_SYSTEM_PROMPT_PREFIX,
  BIRTH_FIRST_MESSAGE,
} from "./birth-prompt";
