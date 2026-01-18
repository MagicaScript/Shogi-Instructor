import { app, BrowserWindow, protocol } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

protocol.registerSchemesAsPrivileged([
 {
   scheme: 'app',
   privileges: {
     standard: true,
     secure: true,
     supportFetchAPI: true,
     corsEnabled: true,
   },
 },
]);

let mainWindow;
let backendProcess;

function getBackendPath() {
 if (app.isPackaged) return path.join(process.resourcesPath, 'backend.exe');
 return path.join(__dirname, '../../backend/dist/backend.exe');
}

function startBackend() {
  const backendPath = getBackendPath();
  console.log('Starting backend from:', backendPath);

  backendProcess = spawn(backendPath, [], {
    cwd: path.dirname(backendPath),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  backendProcess.stdout?.on('data', (d) => console.log(`Backend stdout: ${d}`));
  backendProcess.stderr?.on('data', (d) => console.error(`Backend stderr: ${d}`));

  backendProcess.on('close', (code) =>
    console.log(`Backend process exited with code ${code}`)
  );

  backendProcess.on('error', (err) =>
    console.error('Failed to start backend:', err)
  );
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) {
    backendProcess = null;
    return;
  }

  const pid = backendProcess.pid;

  try {
    if (process.platform === 'win32') {
      // Kill process tree on Windows
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      // Kill process group on macOS/Linux
      process.kill(-pid, 'SIGKILL');
    }
  } catch (_) {
    try {
      backendProcess.kill('SIGKILL');
    } catch {}
  }

  backendProcess = null;
}

function mimeOf(p) {
 if (p.endsWith('.html')) return 'text/html; charset=utf-8';
 if (p.endsWith('.js')) return 'text/javascript; charset=utf-8';
 if (p.endsWith('.css')) return 'text/css; charset=utf-8';
 if (p.endsWith('.json')) return 'application/json; charset=utf-8';
 if (p.endsWith('.svg')) return 'image/svg+xml';
 if (p.endsWith('.png')) return 'image/png';
 if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
 if (p.endsWith('.webp')) return 'image/webp';
 if (p.endsWith('.wasm')) return 'application/wasm';
 if (p.endsWith('.map')) return 'application/json; charset=utf-8';
 if (p.endsWith('.ico')) return 'image/x-icon';
 if (p.endsWith('.woff')) return 'font/woff';
 if (p.endsWith('.woff2')) return 'font/woff2';
 if (p.endsWith('.ttf')) return 'font/ttf';
 return 'application/octet-stream';
}

async function fileExists(p) {
 try {
   const st = await fs.stat(p);
   return st.isFile();
 } catch {
   return false;
 }
}

async function installAppProtocol(distDir) {
 await protocol.handle('app', async (request) => {
   const u = new URL(request.url);

   // Map app://-/<path> -> dist/<path>
   const reqPath = decodeURIComponent(u.pathname || '/');
   const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
   let filePath = path.join(distDir, safePath);

   // SPA fallback
   if (reqPath === '/' || !(await fileExists(filePath))) {
     filePath = path.join(distDir, 'index.html');
   }

   const data = await fs.readFile(filePath);

   return new Response(data, {
     headers: {
       'Content-Type': mimeOf(filePath),
       'Cross-Origin-Opener-Policy': 'same-origin',
       'Cross-Origin-Embedder-Policy': 'require-corp',
       'Cross-Origin-Resource-Policy': 'same-origin',
     },
   });
 });
}

async function createWindow() {
 mainWindow = new BrowserWindow({
   width: 1200,
   height: 800,
   autoHideMenuBar: true,
   webPreferences: {
     preload: path.join(__dirname, 'preload.js'),
     contextIsolation: true,
     nodeIntegration: false,
   },
 });

 if (process.env.NODE_ENV === 'development') {
   await mainWindow.loadURL('http://localhost:5173');
   mainWindow.webContents.openDevTools();
   return;
 }

 const distDir = path.join(__dirname, '../dist');
 await installAppProtocol(distDir);

 await mainWindow.loadURL('app://-/');
}

app.whenReady().then(() => {
 startBackend();
 createWindow();

 app.on('activate', () => {
   if (BrowserWindow.getAllWindows().length === 0) createWindow();
 });
});

app.on('window-all-closed', () => {
 stopBackend();
 if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
 stopBackend();
});
