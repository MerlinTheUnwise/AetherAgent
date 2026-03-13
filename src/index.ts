#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { login, logout, getToken } from "./auth.js";
import { addFolder, removeFolder, listFolders } from "./permissions.js";
import { connect, disconnect, onStateChange } from "./connection.js";
import { API_URL } from "./config.js";
import { enableAutoStart, disableAutoStart, promptAutoStart } from "./autostart.js";
import { pickFolderGui } from "./picker.js";
import { checkForUpdate } from "./updater.js";

// pkg-safe tray import — systray2 may not bundle correctly in pkg executables
async function tryStartTray(cbs: {
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
  onOpenFolders: () => void;
}): Promise<boolean> {
  try {
    const { startTray } = await import("./tray.js");
    startTray(cbs);
    return true;
  } catch {
    console.log("  (System tray not available — running in console mode)");
    console.log("  The agent is still connected and working.");
    return false;
  }
}

async function tryUpdateTrayState(state: "connected" | "connecting" | "disconnected" | "paused"): Promise<void> {
  try {
    const { updateTrayState } = await import("./tray.js");
    updateTrayState(state);
  } catch {
    // Tray not available
  }
}

async function tryStopTray(): Promise<void> {
  try {
    const { stopTray } = await import("./tray.js");
    stopTray();
  } catch {
    // Tray not available
  }
}

// Shared agent start logic
async function startAgent(opts: { background: boolean; showTray: boolean }): Promise<void> {
  const token = getToken();
  if (!token) {
    console.log(chalk.red("Not logged in. Run 'aether-agent login' first."));
    process.exit(1);
  }

  await checkForUpdate();

  if (opts.showTray) {
    onStateChange((state) => {
      tryUpdateTrayState(state === "connected" ? "connected" : state === "connecting" ? "connecting" : "disconnected");
    });

    await tryStartTray({
      onPause: () => {
        console.log(chalk.gray("Agent paused."));
        tryUpdateTrayState("paused");
        disconnect();
      },
      onResume: () => {
        console.log(chalk.blue("Agent resumed."));
        connect();
      },
      onQuit: () => {
        disconnect();
        tryStopTray();
        process.exit(0);
      },
      onOpenFolders: () => {
        listFolders();
      },
    });
  }

  await connect();

  // Keep process alive
  process.on("SIGINT", () => {
    console.log(chalk.gray("\nStopping agent..."));
    disconnect();
    tryStopTray();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    disconnect();
    tryStopTray();
    process.exit(0);
  });
}

// Interactive mode — when exe is double-clicked with no arguments
async function interactiveMode(): Promise<void> {
  console.log("");
  console.log("  ╔═══════════════════════════════════╗");
  console.log("  ║        Aether Agent               ║");
  console.log("  ║  Verified local file automation    ║");
  console.log("  ╚═══════════════════════════════════╝");
  console.log("");

  const token = getToken();

  if (!token) {
    // First time setup
    console.log("  Welcome! Let's get you set up.");
    console.log("  Opening your browser to sign in...");
    console.log("");

    await login();

    console.log("");
    console.log("  Now let's pick a folder Aether can use.");
    console.log("  A window will open — choose a folder.");
    console.log("");

    const picked = await pickFolderGui();
    if (picked) {
      await addFolder(picked);
    }

    console.log("");
    await promptAutoStart();

    console.log("");
    console.log("  ✓ All set! Aether Agent is running.");
    console.log("  You'll see a small icon in your taskbar.");
    console.log("");
    console.log("  You can close this window — the agent");
    console.log("  keeps running in the background.");
    console.log("");
  } else {
    console.log("  ✓ Already set up. Connecting...");
    console.log("");
  }

  // Start the agent with tray icon
  await startAgent({ background: false, showTray: true });
}

// Detect double-click (no arguments) vs CLI usage
const args = process.argv.slice(2);

if (args.length === 0) {
  interactiveMode();
} else {
  const program = new Command()
    .name("aether-agent")
    .description("Aether Agent — verified local file automation")
    .version("0.1.0");

  program
    .command("login")
    .description("Authenticate with Aether cloud")
    .action(async () => {
      await login();
      await promptAutoStart();
    });

  program
    .command("logout")
    .description("Remove stored credentials")
    .action(logout);

  program
    .command("start")
    .description("Start the agent (connects to Aether cloud)")
    .option("--background", "Run in background with system tray")
    .action(async (opts: { background?: boolean }) => {
      console.log(chalk.blue("Starting Aether Agent..."));
      await startAgent({ background: !!opts.background, showTray: !!opts.background });
    });

  program
    .command("stop")
    .description("Stop the agent")
    .action(() => {
      console.log(chalk.gray("To stop the agent, press Ctrl+C in the terminal where it's running."));
    });

  program
    .command("status")
    .description("Show agent connection status")
    .action(async () => {
      const token = getToken();
      if (!token) {
        console.log(chalk.red("Not logged in."));
        return;
      }

      await checkForUpdate();

      try {
        const res = await fetch(`${API_URL}/api/agent/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          console.log(chalk.red("Failed to get status. You may need to re-login."));
          return;
        }

        const data = await res.json() as {
          hasAgent: boolean;
          status?: string;
          permissions?: unknown[];
          opsToday?: number;
          hostname?: string;
        };

        if (!data.hasAgent) {
          console.log(chalk.yellow("No agent session found. Run 'aether-agent login'."));
          return;
        }

        const statusColor = data.status === "connected" ? chalk.green : chalk.gray;
        console.log(`Status: ${statusColor(data.status ?? "unknown")}`);
        if (data.hostname) console.log(`Device: ${data.hostname}`);
        console.log(`Folders: ${(data.permissions ?? []).length} shared`);
        console.log(`Operations today: ${data.opsToday ?? 0}`);
      } catch (err) {
        console.error(chalk.red("Status check failed:"), (err as Error).message);
      }
    });

  program
    .command("folders")
    .description("List permitted folders")
    .action(() => listFolders());

  program
    .command("add-folder [path]")
    .description("Add a folder permission")
    .option("--gui", "Open a visual folder picker in the browser")
    .action(async (folderPath: string | undefined, opts: { gui?: boolean }) => {
      if (opts.gui) {
        const picked = await pickFolderGui();
        if (picked) {
          await addFolder(picked);
        } else {
          console.log(chalk.yellow("No folder selected."));
        }
      } else if (folderPath) {
        await addFolder(folderPath);
      } else {
        console.log(chalk.red("Provide a folder path or use --gui to pick visually."));
      }
    });

  program
    .command("remove-folder <path>")
    .description("Remove a folder permission")
    .action(removeFolder);

  program
    .command("auto-start")
    .description("Manage auto-start on login")
    .option("--enable", "Enable auto-start")
    .option("--disable", "Disable auto-start")
    .action(async (opts: { enable?: boolean; disable?: boolean }) => {
      if (opts.enable) {
        await enableAutoStart();
      } else if (opts.disable) {
        await disableAutoStart();
      } else {
        await promptAutoStart();
      }
    });

  program.parse();
}
