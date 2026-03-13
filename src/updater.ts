import chalk from "chalk";

// Hardcoded to avoid pkg issues with require("../package.json")
const CURRENT_VERSION = "0.1.0";

export async function checkForUpdate(): Promise<void> {
  try {
    const response = await fetch("https://registry.npmjs.org/@withaether/agent/latest");
    if (!response.ok) return;
    const data = await response.json() as { version?: string };
    const latest = data.version;
    if (!latest) return;

    const current = CURRENT_VERSION;

    if (latest !== current) {
      console.log();
      console.log(chalk.yellow(`  Update available: ${current} \u2192 ${latest}`));
      console.log(chalk.gray("  Run: npm install -g @withaether/agent"));
      console.log();
    }
  } catch {
    // Silently ignore — don't block startup for update checks
  }
}
