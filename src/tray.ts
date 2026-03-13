import { exec } from "node:child_process";
import os from "node:os";

function openUrl(url: string): void {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
import { WEB_URL } from "./config.js";
import { loadPermissions } from "./permissions.js";

export type TrayState = "connected" | "connecting" | "disconnected" | "paused";

interface TrayCallbacks {
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
  onOpenFolders: () => void;
}

const ICONS: Record<TrayState, string> = {
  connected: createColorIcon(0, 180, 80),    // green
  connecting: createColorIcon(220, 180, 0),   // yellow
  disconnected: createColorIcon(220, 50, 50), // red
  paused: createColorIcon(160, 160, 160),     // gray
};

const STATE_LABELS: Record<TrayState, string> = {
  connected: "Connected to Aether cloud",
  connecting: "Connecting...",
  disconnected: "Disconnected",
  paused: "Paused",
};

let systray: any = null;
let currentState: TrayState = "connecting";
let callbacks: TrayCallbacks | null = null;
let isPaused = false;
let trayAvailable = false;

function createColorIcon(r: number, g: number, b: number): string {
  const width = 16;
  const height = 16;
  const bmpRowSize = Math.ceil((width * 3) / 4) * 4;
  const bmpDataSize = bmpRowSize * height;
  const maskRowSize = Math.ceil(width / 8 / 4) * 4;
  const maskSize = maskRowSize * height;
  const bmpSize = 40 + bmpDataSize + maskSize;

  const ico = Buffer.alloc(6 + 16 + bmpSize);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico[6] = width;
  ico[7] = height;
  ico[8] = 0;
  ico[9] = 0;
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(24, 12);
  ico.writeUInt32LE(bmpSize, 14);
  ico.writeUInt32LE(22, 18);

  const bmpOffset = 22;
  ico.writeUInt32LE(40, bmpOffset);
  ico.writeInt32LE(width, bmpOffset + 4);
  ico.writeInt32LE(height * 2, bmpOffset + 8);
  ico.writeUInt16LE(1, bmpOffset + 12);
  ico.writeUInt16LE(24, bmpOffset + 14);
  ico.writeUInt32LE(0, bmpOffset + 16);
  ico.writeUInt32LE(bmpDataSize + maskSize, bmpOffset + 20);

  const pixelOffset = bmpOffset + 40;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = pixelOffset + y * bmpRowSize + x * 3;
      ico[pos] = b;
      ico[pos + 1] = g;
      ico[pos + 2] = r;
    }
  }

  return ico.toString("base64");
}

const SEPARATOR = { title: "---", tooltip: "", enabled: false };

function buildMenu(): any {
  const perms = loadPermissions();
  const folderCount = perms.length;
  const hostname = os.hostname();

  return {
    icon: ICONS[currentState],
    title: "",
    tooltip: "Aether Agent",
    items: [
      {
        title: STATE_LABELS[currentState],
        tooltip: "",
        enabled: false,
      },
      {
        title: `${hostname} \u00b7 ${folderCount} folder${folderCount !== 1 ? "s" : ""} shared`,
        tooltip: "",
        enabled: false,
      },
      SEPARATOR,
      {
        title: "Shared Folders...",
        tooltip: "Manage shared folders",
        enabled: true,
      },
      {
        title: "Open Aether Dashboard",
        tooltip: "Open withaether.com in browser",
        enabled: true,
      },
      SEPARATOR,
      {
        title: isPaused ? "Resume Agent" : "Pause Agent",
        tooltip: isPaused ? "Resume the agent" : "Pause the agent",
        enabled: true,
      },
      {
        title: "Quit",
        tooltip: "Quit Aether Agent",
        enabled: true,
      },
    ],
  };
}

export async function startTray(cbs: TrayCallbacks): Promise<void> {
  callbacks = cbs;

  try {
    const SysTrayModule = await import("systray2");
    const SysTray = (SysTrayModule as any).default ?? SysTrayModule;

    systray = new (SysTray as any)({
      menu: buildMenu(),
      debug: false,
      copyDir: false,
    });

    systray.onClick((action: any) => {
      switch (action.seq_id) {
        case 3: // Shared Folders
          callbacks?.onOpenFolders();
          break;
        case 4: // Open Dashboard
          openUrl(WEB_URL);
          break;
        case 6: // Pause/Resume
          if (isPaused) {
            isPaused = false;
            callbacks?.onResume();
          } else {
            isPaused = true;
            callbacks?.onPause();
          }
          updateTray();
          break;
        case 7: // Quit
          callbacks?.onQuit();
          break;
      }
    });

    trayAvailable = true;
  } catch {
    trayAvailable = false;
  }

  if (!trayAvailable) {
    console.log("  Running in console mode (system tray not available in this build)");
    console.log("  The agent is connected and working. Press Ctrl+C to stop.");
  }
}

export function updateTrayState(state: TrayState): void {
  currentState = state;
  updateTray();
}

function updateTray(): void {
  if (!systray) return;

  const perms = loadPermissions();
  const folderCount = perms.length;
  const hostname = os.hostname();

  systray.sendAction({
    type: "update-menu",
    menu: {
      icon: ICONS[currentState],
      title: "",
      tooltip: "Aether Agent",
      items: [
        {
          title: STATE_LABELS[currentState],
          tooltip: "",
          enabled: false,
        },
        {
          title: `${hostname} \u00b7 ${folderCount} folder${folderCount !== 1 ? "s" : ""} shared`,
          tooltip: "",
          enabled: false,
        },
        SEPARATOR,
        {
          title: "Shared Folders...",
          tooltip: "Manage shared folders",
          enabled: true,
        },
        {
          title: "Open Aether Dashboard",
          tooltip: "Open withaether.com in browser",
          enabled: true,
        },
        SEPARATOR,
        {
          title: isPaused ? "Resume Agent" : "Pause Agent",
          tooltip: isPaused ? "Resume the agent" : "Pause the agent",
          enabled: true,
        },
        {
          title: "Quit",
          tooltip: "Quit Aether Agent",
          enabled: true,
        },
      ],
    },
  });
}

export function stopTray(): void {
  if (systray) {
    systray.kill(false);
    systray = null;
  }
}
