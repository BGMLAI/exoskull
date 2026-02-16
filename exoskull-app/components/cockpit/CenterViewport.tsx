"use client";

import { useCockpitStore } from "@/lib/stores/useCockpitStore";
import { UnifiedStream } from "@/components/stream/UnifiedStream";
import { PreviewPane } from "./PreviewPane";
import { HierarchyTree } from "./HierarchyTree";
import { useOrbData } from "@/lib/hooks/useOrbData";

/**
 * CenterViewport — Chat/Preview/Tree switcher.
 *
 * - navStack depth < 2 + chat mode → UnifiedStream
 * - navStack depth >= 2 → HierarchyTree (quests and deeper)
 * - preview mode → PreviewPane
 *
 * Chat + Tree layers stay mounted (opacity toggle) to preserve SSE + scroll.
 */
export function CenterViewport() {
  const centerMode = useCockpitStore((s) => s.centerMode);
  const navStack = useCockpitStore((s) => s.navStack);
  const { getNode, loadChildren } = useOrbData();

  const isPreview = centerMode === "preview";
  const depth = navStack.length;

  // At depth >= 2 we show the tree (user clicked a Loop)
  const showTree = depth >= 2 && !isPreview;
  const isChat = !isPreview && !showTree;

  // Get the focused node for tree display
  const focusedEntry = depth > 0 ? navStack[depth - 1] : null;
  const focusedNode = focusedEntry ? getNode(focusedEntry.id) : null;

  // Tree nodes = children of focused node
  const treeNodes = focusedNode?.children || [];
  const treeLabel = focusedEntry?.label || "";
  const treeColor = focusedNode?.color || "#06b6d4";

  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      {/* Chat layer — always mounted */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isChat ? 1 : 0,
          pointerEvents: isChat ? "auto" : "none",
          transition: "opacity 200ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <UnifiedStream className="flex-1 bg-transparent" />
      </div>

      {/* Tree layer — shown when drilled into Loop+ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: showTree ? 1 : 0,
          pointerEvents: showTree ? "auto" : "none",
          transition: "opacity 200ms ease",
          background: "rgba(5, 5, 16, 0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        {showTree && (
          <HierarchyTree
            nodes={treeNodes}
            parentLabel={treeLabel}
            parentColor={treeColor}
            onLoadChildren={loadChildren}
          />
        )}
      </div>

      {/* Preview layer — always mounted */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: isPreview ? 1 : 0,
          pointerEvents: isPreview ? "auto" : "none",
          transition: "opacity 200ms ease",
          transform: isPreview ? "translateX(0)" : "translateX(4px)",
        }}
      >
        <PreviewPane />
      </div>
    </div>
  );
}
