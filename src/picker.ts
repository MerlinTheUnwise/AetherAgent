import http from "node:http";
import { exec } from "node:child_process";

function openUrl(url: string): void {
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

export async function pickFolderGui(): Promise<string | null> {
  let selectedFolder: string | null = null;

  return new Promise<string | null>((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; text-align: center; background: #fafafa;">
  <h2 style="color: #1a1a1a;">Select a folder for Aether</h2>
  <p style="color: #666;">Choose a folder that Aether can access on your computer.</p>
  <input type="file" id="picker" webkitdirectory style="display:none" />
  <button onclick="document.getElementById('picker').click()"
    style="padding: 12px 24px; font-size: 16px; cursor: pointer; background: #2D5A3D; color: white; border: none; border-radius: 8px; margin-top: 16px;">
    Choose Folder
  </button>
  <div id="status" style="margin-top: 24px; color: #666;"></div>
  <script>
    document.getElementById('picker').addEventListener('change', (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const relativePath = files[0].webkitRelativePath;
      const folderName = relativePath ? relativePath.split('/')[0] : '';
      document.getElementById('status').innerHTML = '<p style="color: #2D5A3D; font-weight: bold;">Folder selected: ' + folderName + '</p><p>You can close this tab.</p>';
      fetch('/selected', { method: 'POST', body: folderName });
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
          selectedFolder = body || null;
          res.writeHead(200);
          res.end("ok");
          server.close();
          resolve(selectedFolder);
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
