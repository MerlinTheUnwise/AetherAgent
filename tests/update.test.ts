import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Update checker", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("shows update message when newer version is available", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "9.9.9" }),
    }) as any;

    const { checkForUpdate } = await import("../src/updater.js");
    await checkForUpdate();

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Update available");
    expect(output).toContain("9.9.9");
  });

  it("shows nothing when version is current", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "0.1.0" }),
    }) as any;

    const { checkForUpdate } = await import("../src/updater.js");
    await checkForUpdate();

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Update available");
  });

  it("does not crash on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error")) as any;

    const { checkForUpdate } = await import("../src/updater.js");
    // Should not throw
    await expect(checkForUpdate()).resolves.toBeUndefined();
  });

  it("does not crash on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as any;

    const { checkForUpdate } = await import("../src/updater.js");
    await expect(checkForUpdate()).resolves.toBeUndefined();
  });

  it("does not crash when version field is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any;

    const { checkForUpdate } = await import("../src/updater.js");
    await expect(checkForUpdate()).resolves.toBeUndefined();
  });
});
