import WebSocket from "ws";
import chalk from "chalk";
import { WS_URL } from "./config.js";
import { getToken } from "./auth.js";
import { executeLocal } from "./executor.js";
import type { FileRequest } from "./executor.js";
import { notifyFileSaved, notifyPermissionDenied, notifyDisconnected, notifyReconnected } from "./notifications.js";

interface WsMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

export type ConnectionState = "connected" | "connecting" | "disconnected";

export type StateChangeCallback = (state: ConnectionState) => void;

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let shouldReconnect = true;
let stateChangeCallback: StateChangeCallback | null = null;
let wasConnected = false;

function getBackoffMs(): number {
  const base = Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000);
  const jitter = Math.random() * 1000;
  return base + jitter;
}

export function onStateChange(cb: StateChangeCallback): void {
  stateChangeCallback = cb;
}

function emitState(state: ConnectionState): void {
  stateChangeCallback?.(state);
}

export async function connect(): Promise<void> {
  const token = getToken();
  if (!token) {
    console.log(chalk.red("Not logged in. Run 'aether-agent login' first."));
    process.exit(1);
  }

  shouldReconnect = true;
  emitState("connecting");
  doConnect(token);
}

function doConnect(token: string): void {
  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    reconnectAttempts = 0;
    emitState("connecting");

    // Authenticate
    ws!.send(JSON.stringify({
      type: "auth",
      payload: { agentToken: token },
    }));
  });

  ws.on("message", async (raw) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "auth_ok": {
        const info = msg.payload as { plan?: string; limits?: { maxOpsPerDay?: number }; opsToday?: number };
        const plan = info.plan ?? "free";
        const opsLimit = info.limits?.maxOpsPerDay === -1 ? "unlimited" : String(info.limits?.maxOpsPerDay ?? "?");
        const opsToday = info.opsToday ?? 0;
        console.log(chalk.green("\u2713 Connected to Aether cloud"));
        console.log(chalk.gray(`  ${plan} plan \u00b7 ${opsToday}/${opsLimit} operations today`));
        emitState("connected");
        if (wasConnected) {
          notifyReconnected();
        }
        wasConnected = true;
        break;
      }

      case "auth_fail": {
        const err = msg.payload as { error?: string };
        console.log(chalk.red(`Authentication failed: ${err.error ?? "Unknown error"}`));
        console.log(chalk.yellow("Try 'aether-agent logout' then 'aether-agent login'."));
        shouldReconnect = false;
        ws?.close();
        break;
      }

      case "ping":
        ws?.send(JSON.stringify({ type: "pong" }));
        break;

      case "request": {
        const request = msg.payload as FileRequest;
        const result = await executeLocal(request);

        // Notify on writes and permission denials
        if (result.success && request.op === "write_file" && request.path) {
          notifyFileSaved(request.path);
        }
        if (!result.success && result.error?.includes("Permission denied")) {
          notifyPermissionDenied(request.path);
        }

        ws?.send(JSON.stringify({
          type: "response",
          id: msg.id,
          payload: result,
        }));
        break;
      }

      case "plan_changed": {
        const info = msg.payload as { plan?: string };
        console.log(chalk.yellow(`Plan changed to: ${info.plan}`));
        break;
      }

      case "disconnect": {
        const info = msg.payload as { reason?: string };
        console.log(chalk.red(`Disconnected by server: ${info.reason ?? "unknown"}`));
        shouldReconnect = false;
        ws?.close();
        break;
      }
    }
  });

  ws.on("close", () => {
    ws = null;
    emitState("disconnected");
    if (wasConnected) {
      notifyDisconnected();
    }
    if (shouldReconnect) {
      reconnectAttempts++;
      const delay = getBackoffMs();
      console.log(chalk.gray(`Disconnected. Reconnecting in ${Math.round(delay / 1000)}s...`));
      emitState("connecting");
      setTimeout(() => doConnect(token), delay);
    }
  });

  ws.on("error", (err) => {
    // Suppress connection refused errors during reconnect
    if (reconnectAttempts === 0) {
      console.error(chalk.red("Connection error:"), err.message);
    }
  });
}

export function disconnect(): void {
  shouldReconnect = false;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}
