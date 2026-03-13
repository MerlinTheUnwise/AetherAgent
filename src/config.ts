import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".aether-agent");
export const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");
export const PERMISSIONS_FILE = join(CONFIG_DIR, "permissions.json");

export const API_URL = process.env.AETHER_API_URL ?? "https://api.withaether.com";
export const WS_URL = process.env.AETHER_WS_URL ?? "wss://api.withaether.com/agent/ws";
export const WEB_URL = process.env.AETHER_WEB_URL ?? "https://withaether.com";
