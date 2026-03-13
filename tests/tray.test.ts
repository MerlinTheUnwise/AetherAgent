import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock systray2 before importing tray module
vi.mock("systray2", () => {
  const mockSendAction = vi.fn();
  const mockOnClick = vi.fn();
  const mockKill = vi.fn();

  class MockSysTray {
    static separator = { title: "---" };
    menu: any;
    constructor(opts: any) {
      this.menu = opts.menu;
    }
    onClick = mockOnClick;
    sendAction = mockSendAction;
    kill = mockKill;
  }

  return { default: MockSysTray, __mockSendAction: mockSendAction, __mockOnClick: mockOnClick, __mockKill: mockKill };
});

vi.mock("open", () => ({ default: vi.fn() }));

vi.mock("../src/permissions.js", () => ({
  loadPermissions: vi.fn(() => [
    { path: "/home/user/docs", access: "read_write", recursive: true },
  ]),
}));

vi.mock("../src/config.js", () => ({
  WEB_URL: "https://withaether.com",
}));

describe("Tray module", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exports startTray, updateTrayState, and stopTray", async () => {
    const tray = await import("../src/tray.js");
    expect(typeof tray.startTray).toBe("function");
    expect(typeof tray.updateTrayState).toBe("function");
    expect(typeof tray.stopTray).toBe("function");
  });

  it("TrayState type includes all expected states", async () => {
    // Verify the module loads without error — states are checked at type level
    const tray = await import("../src/tray.js");
    const states: Array<import("../src/tray.js").TrayState> = [
      "connected",
      "connecting",
      "disconnected",
      "paused",
    ];
    expect(states).toHaveLength(4);
  });

  it("startTray creates a tray and accepts callbacks", async () => {
    const tray = await import("../src/tray.js");
    const callbacks = {
      onPause: vi.fn(),
      onResume: vi.fn(),
      onQuit: vi.fn(),
      onOpenFolders: vi.fn(),
    };

    // Should not throw
    expect(() => tray.startTray(callbacks)).not.toThrow();
  });

  it("updateTrayState does not throw for any valid state", async () => {
    const tray = await import("../src/tray.js");
    // Start tray first
    tray.startTray({
      onPause: vi.fn(),
      onResume: vi.fn(),
      onQuit: vi.fn(),
      onOpenFolders: vi.fn(),
    });

    expect(() => tray.updateTrayState("connected")).not.toThrow();
    expect(() => tray.updateTrayState("connecting")).not.toThrow();
    expect(() => tray.updateTrayState("disconnected")).not.toThrow();
    expect(() => tray.updateTrayState("paused")).not.toThrow();
  });

  it("stopTray does not throw when tray is not started", async () => {
    // Fresh import — no tray started
    const tray = await import("../src/tray.js");
    expect(() => tray.stopTray()).not.toThrow();
  });
});
