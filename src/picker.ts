import http from "node:http";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";

function openUrl(url: string): void {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

export async function pickFolderGui(): Promise<string | null> {
  const home = os.homedir();
  const quickPicks: Record<string, string> = {
    Desktop: path.join(home, "Desktop"),
    Documents: path.join(home, "Documents"),
    Downloads: path.join(home, "Downloads"),
  };

  return new Promise<string | null>((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; text-align: center; background: #fafafa;">
  <h2 style="color: #1a1a1a;">Pick a folder for Aether</h2>
  <p style="color: #666;">Choose a folder where Aether can save files.</p>

  <p style="color: #333; font-weight: bold; margin-top: 24px;">Quick picks:</p>
  <div style="display: flex; gap: 12px; justify-content: center; margin-top: 8px;">
    <button onclick="selectPath('Desktop')" style="padding: 12px 20px; font-size: 15px; cursor: pointer; background: #2D5A3D; color: white; border: none; border-radius: 8px;">Desktop</button>
    <button onclick="selectPath('Documents')" style="padding: 12px 20px; font-size: 15px; cursor: pointer; background: #2D5A3D; color: white; border: none; border-radius: 8px;">Documents</button>
    <button onclick="selectPath('Downloads')" style="padding: 12px 20px; font-size: 15px; cursor: pointer; background: #2D5A3D; color: white; border: none; border-radius: 8px;">Downloads</button>
  </div>

  <p style="margin-top: 28px; color: #666;">Or choose a different folder:</p>
  <input type="file" id="picker" webkitdirectory style="display:none" />
  <button onclick="document.getElementById('picker').click()"
    style="padding: 10px 20px; font-size: 14px; cursor: pointer; background: #555; color: white; border: none; border-radius: 8px;">
    Browse...
  </button>
  <p style="margin-top: 8px; color: #999; font-size: 13px;">Navigate into a real folder (like Desktop or Documents) before clicking Select Folder.</p>

  <div id="status" style="margin-top: 24px; color: #666;"></div>
  <script>
    function selectPath(name) {
      document.getElementById('status').innerHTML = '<p style="color: #2D5A3D; font-weight: bold;">Selected: ' + name + '</p><p>You can close this tab.</p>';
      fetch('/selected', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quickPick: name }) });
    }

    document.getElementById('picker').addEventListener('change', (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const relativePath = files[0].webkitRelativePath;
      const folderName = relativePath ? relativePath.split('/')[0] : '';
      document.getElementById('status').innerHTML = '<p style="color: #2D5A3D; font-weight: bold;">Folder selected: ' + folderName + '</p><p>You can close this tab.</p>';
      fetch('/selected', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browse: folderName }) });
    });
  </script>
</body>
</html>`);
        return;
      }

      if (req.url === "/selected" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const data = JSON.parse(body) as { quickPick?: string; browse?: string };
            if (data.quickPick && quickPicks[data.quickPick]) {
              resolve(quickPicks[data.quickPick]);
            } else if (data.browse) {
              resolve(data.browse);
            } else {
              resolve(null);
            }
          } catch {
            resolve(body || null);
          }
          res.writeHead(200);
          res.end("ok");
          server.close();
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        console.log(`Opening folder picker at http://localhost:${port}`);
        openUrl(`http://localhost:${port}`);
      }
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      server.close();
      resolve(null);
    }, 60_000);
  });
}
