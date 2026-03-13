import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import chalk from "chalk";

function openUrl(url: string): void {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
import { CONFIG_DIR, CREDENTIALS_FILE, API_URL, WEB_URL } from "./config.js";

interface Credentials {
  agentToken: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getToken(): string | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    const creds: Credentials = JSON.parse(raw);
    return creds.agentToken ?? null;
  } catch {
    return null;
  }
}

function saveToken(agentToken: string): void {
  ensureConfigDir();
  const creds: Credentials = { agentToken };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), "utf-8");
}

async function pollForAuth(deviceCode: string, maxAttempts: number): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const res = await fetch(`${API_URL}/api/agent/auth/poll/${deviceCode}`);
      if (!res.ok) {
        if (res.status === 410 || res.status === 404) {
          return null; // expired
        }
        continue;
      }
      const data = await res.json() as { status: string; agentToken?: string };
      if (data.status === "authorized" && data.agentToken) {
        return data.agentToken;
      }
    } catch {
      // Network error, keep polling
    }
  }
  return null;
}

export async function login(): Promise<void> {
  const existing = getToken();
  if (existing) {
    console.log(chalk.yellow("Already logged in. Run 'aether-agent logout' first to re-authenticate."));
    return;
  }

  console.log(chalk.blue("Requesting device code..."));

  try {
    const res = await fetch(`${API_URL}/api/agent/auth/device-code`, { method: "POST" });
    if (!res.ok) {
      console.log(chalk.red("Failed to get device code. Is the server running?"));
      return;
    }

    const { deviceCode } = await res.json() as { deviceCode: string };

    console.log();
    console.log(chalk.bold(`Device code: ${deviceCode}`));
    console.log();
    console.log("Opening your browser to authorize...");

    const authUrl = `${WEB_URL}/agent/auth?code=${deviceCode}`;
    openUrl(authUrl);

    console.log(chalk.gray(`If the browser didn't open, go to: ${authUrl}`));
    console.log();
    console.log("Waiting for authorization...");

    const token = await pollForAuth(deviceCode, 150); // 5 minutes

    if (token) {
      saveToken(token);
      console.log(chalk.green("✓ Logged in successfully!"));
    } else {
      console.log(chalk.red("Authorization timed out. Please try again."));
    }
  } catch (err) {
    console.error(chalk.red("Login failed:"), (err as Error).message);
  }
}

export async function logout(): Promise<void> {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
    console.log(chalk.green("✓ Logged out."));
  } catch (err) {
    console.error(chalk.red("Logout failed:"), (err as Error).message);
  }
}
