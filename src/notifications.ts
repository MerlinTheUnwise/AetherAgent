import path from "node:path";

const APP_NAME = "Aether Agent";

// pkg-safe notification — node-notifier may not bundle correctly
function safeNotify(opts: { title: string; message: string; sound?: boolean }): void {
  try {
    // Dynamic import to handle pkg bundling failures
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifier = require("node-notifier");
    notifier.notify(opts);
  } catch {
    // Fall back to console output if native notifications unavailable
    console.log(`  [${opts.title}] ${opts.message}`);
  }
}

export function notifyFileSaved(filePath: string): void {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  safeNotify({
    title: APP_NAME,
    message: `Saved "${base}" to ${dir}`,
    sound: false,
  });
}

export function notifyPermissionDenied(filePath: string): void {
  safeNotify({
    title: APP_NAME,
    message: `Permission denied: ${filePath}`,
    sound: true,
  });
}

export function notifyDisconnected(): void {
  safeNotify({
    title: APP_NAME,
    message: "Disconnected from Aether cloud",
    sound: false,
  });
}

export function notifyReconnected(): void {
  safeNotify({
    title: APP_NAME,
    message: "Reconnected to Aether cloud",
    sound: false,
  });
}
