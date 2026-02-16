"use client";

import { useEffect } from "react";
import { useCockpitStore } from "@/lib/stores/useCockpitStore";

const SECTION_IDS = [
  "tasks",
  "activity",
  "email",
  "calendar",
  "stats",
  "knowledge",
];

/**
 * Keyboard shortcuts for the cockpit HUD.
 *
 * Escape → close preview
 * Ctrl+1-6 → toggle panel visibility
 * Ctrl+[ → shrink wings by 20px
 * Ctrl+] → grow wings by 20px
 */
export function useCockpitKeys() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = useCockpitStore.getState();

      // Escape → close preview
      if (e.key === "Escape" && store.centerMode === "preview") {
        store.closePreview();
        return;
      }

      // Tab → toggle HUD minimize (only when not in input/textarea)
      if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          store.toggleHudMinimized();
          return;
        }
      }

      // Ctrl+1-6 → toggle panel visibility
      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          const sectionId = SECTION_IDS[num - 1];
          if (sectionId) {
            const section = store.sections.find((s) => s.id === sectionId);
            if (section) {
              if (section.visible) store.hideSection(sectionId);
              else store.showSection(sectionId);
            }
          }
          return;
        }

        // Ctrl+[ → shrink wings
        if (e.key === "[") {
          e.preventDefault();
          store.setLeftWingWidth(Math.max(200, store.leftWingWidth - 20));
          store.setRightWingWidth(Math.max(200, store.rightWingWidth - 20));
          return;
        }

        // Ctrl+] → grow wings
        if (e.key === "]") {
          e.preventDefault();
          store.setLeftWingWidth(Math.min(400, store.leftWingWidth + 20));
          store.setRightWingWidth(Math.min(400, store.rightWingWidth + 20));
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
