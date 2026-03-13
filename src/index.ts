#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { login, logout, getToken } from "./auth.js";
import { addFolder, removeFolder, listFolders } from "./permissions.js";
import { connect, disconnect } from "./connection.js";
import { API_URL } from "./config.js";

const program = new Command()
  .name("aether-agent")
  .description("Aether Agent — verified local file automation")
  .version("0.1.0");

program
  .command("login")
  .description("Authenticate with Aether cloud")
  .action(login);

program
  .command("logout")
  .description("Remove stored credentials")
  .action(logout);

program
  .command("start")
  .description("Start the agent (connects to Aether cloud)")
  .action(async () => {
    const token = getToken();
    if (!token) {
      console.log(chalk.red("Not logged in. Run 'aether-agent login' first."));
      process.exit(1);
    }

    console.log(chalk.blue("Starting Aether Agent..."));
    await connect();

    // Keep process alive
    process.on("SIGINT", () => {
      console.log(chalk.gray("\nStopping agent..."));
      disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      disconnect();
      process.exit(0);
    });
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
  .command("add-folder <path>")
  .description("Add a folder permission")
  .action(addFolder);

program
  .command("remove-folder <path>")
  .description("Remove a folder permission")
  .action(removeFolder);

program.parse();
