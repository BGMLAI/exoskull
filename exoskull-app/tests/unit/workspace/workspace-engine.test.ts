import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceSupabase: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Must import AFTER mocks
import {
  getOrCreateSession,
  addPanel,
  getPanels,
  removePanel,
} from "@/lib/workspace/workspace-engine";

describe("Workspace Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateSession", () => {
    it("returns existing active session if one exists", async () => {
      const existingSession = {
        id: "sess-123",
        tenant_id: "tenant-1",
        status: "active",
        browser_url: "https://example.com",
        control_mode: "ai",
      };

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: existingSession,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getOrCreateSession("tenant-1");

      expect(result.id).toBe("sess-123");
      expect(result.status).toBe("active");
      expect(mockFrom).toHaveBeenCalledWith("exo_workspace_sessions");
    });

    it("creates new session when none exists", async () => {
      const newSession = {
        id: "sess-new",
        tenant_id: "tenant-1",
        status: "active",
        panels: [],
        control_mode: "ai",
      };

      // First call: check existing → nothing
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Second call: insert
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: newSession,
            error: null,
          }),
        }),
      });

      const result = await getOrCreateSession("tenant-1");

      expect(result.id).toBe("sess-new");
      expect(result.status).toBe("active");
      expect(result.control_mode).toBe("ai");
    });

    it("throws on database error during creation", async () => {
      // Check existing → nothing
      mockSelect.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Insert fails
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "DB connection error" },
          }),
        }),
      });

      await expect(getOrCreateSession("tenant-1")).rejects.toThrow(
        "Failed to create workspace session",
      );
    });
  });

  describe("addPanel", () => {
    it("creates panel with correct fields", async () => {
      const panelData = {
        id: "panel-1",
        panel_type: "dashboard",
        title: "Sales Dashboard",
        content: "<div>Revenue: $100k</div>",
        url: null,
        position: { x: 0, y: 0, w: 12, h: 8 },
        is_pinned: false,
        is_visible: true,
      };

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: panelData,
            error: null,
          }),
        }),
      });

      const result = await addPanel("sess-1", "tenant-1", {
        panel_type: "dashboard",
        title: "Sales Dashboard",
        content: "<div>Revenue: $100k</div>",
        url: null,
        position: { x: 0, y: 0, w: 12, h: 8 },
      });

      expect(result.id).toBe("panel-1");
      expect(result.panel_type).toBe("dashboard");
      expect(result.title).toBe("Sales Dashboard");
      expect(mockFrom).toHaveBeenCalledWith("exo_workspace_panels");
    });

    it("throws on insert error", async () => {
      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "RLS violation" },
          }),
        }),
      });

      await expect(
        addPanel("sess-1", "tenant-1", {
          panel_type: "custom",
          title: "Test",
          content: "x",
          url: null,
          position: { x: 0, y: 0, w: 6, h: 4 },
        }),
      ).rejects.toThrow("Failed to add panel");
    });
  });

  describe("getPanels", () => {
    it("returns visible panels sorted by creation", async () => {
      const panels = [
        { id: "p1", panel_type: "browser", title: "Google", is_visible: true },
        {
          id: "p2",
          panel_type: "terminal",
          title: "Terminal",
          is_visible: true,
        },
      ];

      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: panels,
              error: null,
            }),
          }),
        }),
      });

      const result = await getPanels("sess-1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("p1");
    });

    it("returns empty array on no panels", async () => {
      mockSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const result = await getPanels("sess-1");
      expect(result).toEqual([]);
    });
  });

  describe("removePanel", () => {
    it("soft-deletes by setting is_visible=false", async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await removePanel("panel-1");

      expect(mockFrom).toHaveBeenCalledWith("exo_workspace_panels");
      expect(mockUpdate).toHaveBeenCalledWith({ is_visible: false });
    });
  });
});
