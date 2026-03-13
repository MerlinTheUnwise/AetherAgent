import fs from "node:fs";
import path from "node:path";
import { checkPermission } from "./permissions.js";

export interface FileRequest {
  op: "read_file" | "write_file" | "list_dir" | "file_exists";
  path: string;
  content?: string;
}

export interface FileResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export async function executeLocal(request: FileRequest): Promise<FileResponse> {
  const requiredAccess: "read" | "write" =
    request.op === "write_file" ? "write" : "read";

  if (!checkPermission(request.path, requiredAccess)) {
    return {
      success: false,
      error: `Permission denied: Aether does not have ${requiredAccess} access to ${request.path}`,
    };
  }

  try {
    switch (request.op) {
      case "read_file": {
        const content = await fs.promises.readFile(request.path, "utf-8");
        return { success: true, data: content };
      }

      case "write_file": {
        await fs.promises.mkdir(path.dirname(request.path), { recursive: true });
        await fs.promises.writeFile(request.path, request.content ?? "", "utf-8");
        return {
          success: true,
          data: { written: request.path, bytes: (request.content ?? "").length },
        };
      }

      case "list_dir": {
        const entries = await fs.promises.readdir(request.path, { withFileTypes: true });
        return {
          success: true,
          data: entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
          })),
        };
      }

      case "file_exists": {
        try {
          await fs.promises.access(request.path);
          return { success: true, data: { exists: true } };
        } catch {
          return { success: true, data: { exists: false } };
        }
      }

      default:
        return { success: false, error: `Unknown operation: ${request.op}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
