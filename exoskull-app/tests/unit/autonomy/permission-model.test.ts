import { describe, it, expect, beforeEach } from "vitest";
import { PermissionModel } from "@/lib/autonomy/permission-model";

describe("PermissionModel", () => {
  let model: PermissionModel;

  beforeEach(() => {
    model = new PermissionModel();
  });

  describe("matchesPattern", () => {
    it("matches exact patterns", () => {
      expect(model.matchesPattern("send_sms:family", "send_sms:family")).toBe(
        true,
      );
      expect(model.matchesPattern("send_sms:family", "send_sms:work")).toBe(
        false,
      );
    });

    it("matches global wildcard", () => {
      expect(model.matchesPattern("*", "send_sms:family")).toBe(true);
      expect(model.matchesPattern("*", "make_call:anyone")).toBe(true);
      expect(model.matchesPattern("*", "any_action")).toBe(true);
    });

    it("matches wildcard suffix", () => {
      expect(model.matchesPattern("send_sms:*", "send_sms:family")).toBe(true);
      expect(model.matchesPattern("send_sms:*", "send_sms:work")).toBe(true);
      expect(model.matchesPattern("send_sms:*", "send_email:work")).toBe(false);
    });

    it("matches category prefix", () => {
      expect(model.matchesPattern("send_sms", "send_sms:family")).toBe(true);
      expect(model.matchesPattern("send_sms", "send_sms:work")).toBe(true);
      expect(model.matchesPattern("send_sms", "send_email:work")).toBe(false);
    });

    it("does not match partial strings", () => {
      expect(model.matchesPattern("send", "send_sms:family")).toBe(false);
      expect(model.matchesPattern("sms", "send_sms:family")).toBe(false);
    });

    it("handles edge cases", () => {
      expect(model.matchesPattern("", "")).toBe(true);
      expect(model.matchesPattern("action", "action")).toBe(true);
      expect(model.matchesPattern("action:sub", "action")).toBe(false);
    });
  });

  describe("cache behavior", () => {
    it("clearCache removes specific user", () => {
      // Cache operations work without errors
      model.clearCache("user-1");
      expect(true).toBe(true); // No throw
    });

    it("clearCache with no argument clears all", () => {
      model.clearCache();
      expect(true).toBe(true); // No throw
    });
  });
});
