import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import readline from "node:readline";
import { CONFIG_DIR, PERMISSIONS_FILE, API_URL } from "./config.js";
import { getToken } from "./auth.js";

export interface FolderPermission {
  path: string;
  access: "read" | "write" | "read_write";
  recursive: boolean;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadPermissions(): FolderPermission[] {
  try {
    if (!fs.existsSync(PERMISSIONS_FILE)) return [];
    const raw = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function savePermissions(perms: FolderPermission[]): void {
  ensureConfigDir();
  fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(perms, null, 2), "utf-8");
}

async function syncToCloud(perms: FolderPermission[]): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    await fetch(`${API_URL}/api/agent/folders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ folders: perms }),
    });
  } catch {
    // Sync failures are non-fatal
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function checkPermission(targetPath: string, requiredAccess: "read" | "write"): boolean {
  const perms = loadPermissions();
  const resolved = path.resolve(targetPath);

  for (const perm of perms) {
    const permPath = path.resolve(perm.path);
    const isInFolder = perm.recursive
      ? resolved.startsWith(permPath + path.sep) || resolved === permPath
      : path.dirname(resolved) === permPath;

    if (isInFolder) {
      if (requiredAccess === "read" && (perm.access === "read" || perm.access === "read_write")) return true;
      if (requiredAccess === "write" && (perm.access === "write" || perm.access === "read_write")) return true;
    }
  }
  return false;
}

export async function addFolder(folderPath: string): Promise<void> {
  const resolved = path.resolve(folderPath);

  if (!fs.existsSync(resolved)) {
    console.log(chalk.red(`Folder does not exist: ${resolved}`));
    return;
  }

  if (!fs.statSync(resolved).isDirectory()) {
    console.log(chalk.red(`Not a directory: ${resolved}`));
    return;
  }

  const perms = loadPermissions();
  if (perms.some((p) => path.resolve(p.path) === resolved)) {
    console.log(chalk.yellow(`Folder already added: ${resolved}`));
    return;
  }

  console.log(chalk.blue("Access level:"));
  console.log("  1. Read only — Aether can read files but not change them");
  console.log("  2. Write only — Aether can save new files but not read existing ones");
  console.log("  3. Read and write — Aether can read and save files");

  const choice = await prompt("Choose (1/2/3): ");
  const accessMap: Record<string, FolderPermission["access"]> = {
    "1": "read",
    "2": "write",
    "3": "read_write",
  };
  const access = accessMap[choice];
  if (!access) {
    console.log(chalk.red("Invalid choice."));
    return;
  }

  const recursiveAnswer = await prompt("Include subfolders? (y/n): ");
  const recursive = recursiveAnswer.toLowerCase().startsWith("y");

  const perm: FolderPermission = { path: resolved, access, recursive };
  perms.push(perm);
  savePermissions(perms);
  await syncToCloud(perms);

  const accessLabel = access.replace("_", " and ");
  console.log(chalk.green(`✓ Aether can now ${accessLabel} files in ${resolved}`));
}

export async function removeFolder(folderPath: string): Promise<void> {
  const resolved = path.resolve(folderPath);
  const perms = loadPermissions();
  const filtered = perms.filter((p) => path.resolve(p.path) !== resolved);

  if (filtered.length === perms.length) {
    console.log(chalk.yellow(`Folder not found in permissions: ${resolved}`));
    return;
  }

  savePermissions(filtered);
  await syncToCloud(filtered);
  console.log(chalk.green(`✓ Removed access to ${resolved}`));
}

export function listFolders(): void {
  const perms = loadPermissions();
  if (perms.length === 0) {
    console.log(chalk.gray("No folders shared. Run 'aether-agent add-folder <path>' to add one."));
    return;
  }

  console.log(chalk.bold("Shared folders:"));
  console.log();
  for (const p of perms) {
    const accessLabel = p.access === "read_write" ? "Read & Write" : p.access === "read" ? "Read only" : "Write only";
    const recursiveLabel = p.recursive ? " (+ subfolders)" : "";
    console.log(`  📁 ${p.path}  ${chalk.cyan(accessLabel)}${chalk.gray(recursiveLabel)}`);
  }
}
