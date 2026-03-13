import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import chalk from "chalk";
import readline from "node:readline";

const REGISTRY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const REGISTRY_VALUE = "AetherAgent";

function getAgentBin(): string {
  // Find the installed aether-agent binary
  try {
    if (process.platform === "win32") {
      return execSync("where aether-agent", { encoding: "utf-8" }).trim().split("\n")[0];
    }
    return execSync("which aether-agent", { encoding: "utf-8" }).trim();
  } catch {
    // Fallback to process.argv[1] (the current script)
    return process.argv[1];
  }
}

export async function enableAutoStart(): Promise<void> {
  const platform = process.platform;
  const agentBin = getAgentBin();

  if (platform === "darwin") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.aether.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${agentBin}</string>
    <string>start</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>`;
    const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
    fs.mkdirSync(launchAgentsDir, { recursive: true });
    fs.writeFileSync(path.join(launchAgentsDir, "com.aether.agent.plist"), plist, "utf-8");
  }

  if (platform === "win32") {
    const cmd = `reg add "${REGISTRY_KEY}" /v "${REGISTRY_VALUE}" /t REG_SZ /d "\\"${agentBin}\\" start --background" /f`;
    execSync(cmd, { stdio: "ignore" });
  }

  if (platform === "linux") {
    const desktop = `[Desktop Entry]
Type=Application
Name=Aether Agent
Exec=${agentBin} start --background
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true`;
    const autoStartDir = path.join(os.homedir(), ".config", "autostart");
    fs.mkdirSync(autoStartDir, { recursive: true });
    fs.writeFileSync(path.join(autoStartDir, "aether-agent.desktop"), desktop, "utf-8");
  }

  console.log(chalk.green("\u2713 Aether Agent will start automatically on login."));
}

export async function disableAutoStart(): Promise<void> {
  const platform = process.platform;

  if (platform === "darwin") {
    const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "com.aether.agent.plist");
    if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
  }

  if (platform === "win32") {
    try {
      execSync(`reg delete "${REGISTRY_KEY}" /v "${REGISTRY_VALUE}" /f`, { stdio: "ignore" });
    } catch {
      // Key might not exist
    }
  }

  if (platform === "linux") {
    const desktopPath = path.join(os.homedir(), ".config", "autostart", "aether-agent.desktop");
    if (fs.existsSync(desktopPath)) fs.unlinkSync(desktopPath);
  }

  console.log(chalk.green("\u2713 Auto-start disabled."));
}

export function isAutoStartEnabled(): boolean {
  const platform = process.platform;

  if (platform === "darwin") {
    return fs.existsSync(path.join(os.homedir(), "Library", "LaunchAgents", "com.aether.agent.plist"));
  }

  if (platform === "win32") {
    try {
      const output = execSync(`reg query "${REGISTRY_KEY}" /v "${REGISTRY_VALUE}"`, { encoding: "utf-8" });
      return output.includes(REGISTRY_VALUE);
    } catch {
      return false;
    }
  }

  if (platform === "linux") {
    return fs.existsSync(path.join(os.homedir(), ".config", "autostart", "aether-agent.desktop"));
  }

  return false;
}

export async function promptAutoStart(): Promise<void> {
  if (isAutoStartEnabled()) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("Start Aether Agent automatically when you log in? (y/n): ", resolve);
  });
  rl.close();

  if (answer.trim().toLowerCase().startsWith("y")) {
    await enableAutoStart();
  }
}
