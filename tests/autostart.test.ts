import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes("where aether-agent") || cmd.includes("which aether-agent")) {
      return "/usr/bin/aether-agent\n";
    }
    if (cmd.includes("reg query")) {
      throw new Error("not found");
    }
    return "";
  }),
}));

describe("Auto-start module", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    vi.restoreAllMocks();
  });

  it("enableAutoStart creates a plist on macOS", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);

    const { enableAutoStart } = await import("../src/autostart.js");
    await enableAutoStart();

    const expectedDir = path.join(os.homedir(), "Library", "LaunchAgents");
    expect(mkdirSpy).toHaveBeenCalledWith(expectedDir, { recursive: true });

    const writtenPath = writeSpy.mock.calls[0]?.[0] as string;
    expect(writtenPath).toContain("com.aether.agent.plist");

    const content = writeSpy.mock.calls[0]?.[1] as string;
    expect(content).toContain("com.aether.agent");
    expect(content).toContain("RunAtLoad");
  });

  it("enableAutoStart writes registry on Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    const { execSync } = await import("node:child_process");
    const execMock = vi.mocked(execSync);

    const { enableAutoStart } = await import("../src/autostart.js");
    await enableAutoStart();

    const regCall = execMock.mock.calls.find(([cmd]) =>
      typeof cmd === "string" && cmd.includes("reg add")
    );
    expect(regCall).toBeDefined();
    expect(regCall![0]).toContain("AetherAgent");
  });

  it("enableAutoStart creates .desktop on Linux", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);

    const { enableAutoStart } = await import("../src/autostart.js");
    await enableAutoStart();

    const expectedDir = path.join(os.homedir(), ".config", "autostart");
    expect(mkdirSpy).toHaveBeenCalledWith(expectedDir, { recursive: true });

    const writtenPath = writeSpy.mock.calls[0]?.[0] as string;
    expect(writtenPath).toContain("aether-agent.desktop");

    const content = writeSpy.mock.calls[0]?.[1] as string;
    expect(content).toContain("[Desktop Entry]");
    expect(content).toContain("Aether Agent");
  });

  it("disableAutoStart removes plist on macOS", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockReturnValue(undefined);

    const { disableAutoStart } = await import("../src/autostart.js");
    await disableAutoStart();

    expect(unlinkSpy).toHaveBeenCalled();
    const removedPath = unlinkSpy.mock.calls[0]?.[0] as string;
    expect(removedPath).toContain("com.aether.agent.plist");
  });

  it("isAutoStartEnabled returns false when not configured", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const { isAutoStartEnabled } = await import("../src/autostart.js");
    expect(isAutoStartEnabled()).toBe(false);
  });

  it("isAutoStartEnabled returns true when plist exists on macOS", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const { isAutoStartEnabled } = await import("../src/autostart.js");
    expect(isAutoStartEnabled()).toBe(true);
  });
});
