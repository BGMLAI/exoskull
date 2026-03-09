import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock workspace engine
const mockGetOrCreateSession = vi.fn();
const mockExecuteBrowserAction = vi.fn();
const mockAddPanel = vi.fn();
const mockExecuteTerminal = vi.fn();

vi.mock("@/lib/workspace/workspace-engine", () => ({
  getOrCreateSession: (...args: unknown[]) => mockGetOrCreateSession(...args),
  executeBrowserAction: (...args: unknown[]) =>
    mockExecuteBrowserAction(...args),
  addPanel: (...args: unknown[]) => mockAddPanel(...args),
  executeTerminal: (...args: unknown[]) => mockExecuteTerminal(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { workspaceTools } from "@/lib/v3/tools/workspace-tools";

describe("Workspace V3 Tools", () => {
  const tenantId = "tenant-123";
  const session = { id: "sess-1", vps_container_id: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateSession.mockResolvedValue(session);
  });

  it("exports 4 tools", () => {
    expect(workspaceTools).toHaveLength(4);
    const names = workspaceTools.map((t) => t.definition.name);
    expect(names).toContain("open_workspace");
    expect(names).toContain("workspace_action");
    expect(names).toContain("workspace_terminal");
    expect(names).toContain("show_in_workspace");
  });

  describe("open_workspace", () => {
    const tool = workspaceTools.find(
      (t) => t.definition.name === "open_workspace",
    )!;

    it("tries browser navigation first, falls back to panel", async () => {
      // Browser action fails (no VPS)
      mockExecuteBrowserAction.mockRejectedValue(new Error("No VPS"));

      // Panel add succeeds
      mockAddPanel.mockResolvedValue({ id: "panel-1" });

      const result = await tool.execute(
        { url: "https://example.com", title: "Example" },
        tenantId,
      );

      expect(result).toContain("Example");
      expect(result).toContain("panel");
      expect(mockGetOrCreateSession).toHaveBeenCalledWith(tenantId);
      expect(mockAddPanel).toHaveBeenCalledWith(
        "sess-1",
        tenantId,
        expect.objectContaining({
          panel_type: "link_preview",
          title: "Example",
          url: "https://example.com",
        }),
      );
    });

    it("returns success when browser navigation works", async () => {
      mockExecuteBrowserAction.mockResolvedValue({
        success: true,
        title: "Example Page",
        url: "https://example.com",
        screenshot_url: "https://r2.example.com/ss.png",
      });

      const result = await tool.execute(
        { url: "https://example.com" },
        tenantId,
      );

      expect(result).toContain("Example Page");
      expect(result).toContain("Screenshot");
    });

    it("returns error message on complete failure", async () => {
      mockGetOrCreateSession.mockRejectedValue(new Error("DB down"));

      const result = await tool.execute(
        { url: "https://example.com" },
        tenantId,
      );

      expect(result).toContain("Błąd");
      expect(result).toContain("DB down");
    });
  });

  describe("workspace_action", () => {
    const tool = workspaceTools.find(
      (t) => t.definition.name === "workspace_action",
    )!;

    it("executes click action and returns result", async () => {
      mockExecuteBrowserAction.mockResolvedValue({
        success: true,
        url: "https://example.com/page2",
        title: "Page 2",
      });

      const result = await tool.execute(
        { action: "click", target: "#submit-btn" },
        tenantId,
      );

      expect(result).toContain("click");
      expect(result).toContain("Page 2");
      expect(mockExecuteBrowserAction).toHaveBeenCalledWith(
        "sess-1",
        tenantId,
        expect.objectContaining({
          type: "click",
          target: "#submit-btn",
        }),
      );
    });

    it("returns error on failed action", async () => {
      mockExecuteBrowserAction.mockResolvedValue({
        success: false,
        error: "Element not found",
      });

      const result = await tool.execute(
        { action: "click", target: "#nonexistent" },
        tenantId,
      );

      expect(result).toContain("nie powiodła się");
      expect(result).toContain("Element not found");
    });
  });

  describe("workspace_terminal", () => {
    const tool = workspaceTools.find(
      (t) => t.definition.name === "workspace_terminal",
    )!;

    it("executes command and returns output", async () => {
      mockExecuteTerminal.mockResolvedValue({
        output: "hello world\n",
        exitCode: 0,
      });

      const result = await tool.execute({ command: "echo hello" }, tenantId);

      expect(result).toContain("Exit code: 0");
      expect(result).toContain("hello world");
      expect(mockExecuteTerminal).toHaveBeenCalledWith(
        "sess-1",
        tenantId,
        "echo hello",
      );
    });

    it("reports non-zero exit code", async () => {
      mockExecuteTerminal.mockResolvedValue({
        output: "command not found",
        exitCode: 127,
      });

      const result = await tool.execute({ command: "foobar" }, tenantId);

      expect(result).toContain("Exit code: 127");
    });
  });

  describe("show_in_workspace", () => {
    const tool = workspaceTools.find(
      (t) => t.definition.name === "show_in_workspace",
    )!;

    it("creates panel with AI-generated content", async () => {
      mockAddPanel.mockResolvedValue({ id: "panel-42" });

      const result = await tool.execute(
        {
          title: "Revenue Dashboard",
          content: "<div><h1>Revenue: $100k</h1></div>",
          panel_type: "dashboard",
        },
        tenantId,
      );

      expect(result).toContain("Revenue Dashboard");
      expect(result).toContain("panel-42");
      expect(mockAddPanel).toHaveBeenCalledWith(
        "sess-1",
        tenantId,
        expect.objectContaining({
          panel_type: "dashboard",
          title: "Revenue Dashboard",
          content: "<div><h1>Revenue: $100k</h1></div>",
        }),
      );
    });

    it("defaults to custom panel type", async () => {
      mockAddPanel.mockResolvedValue({ id: "panel-99" });

      await tool.execute({ title: "Test", content: "Hello" }, tenantId);

      expect(mockAddPanel).toHaveBeenCalledWith(
        "sess-1",
        tenantId,
        expect.objectContaining({
          panel_type: "custom",
        }),
      );
    });
  });
});
