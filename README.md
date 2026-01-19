## Shogi Instructor (Beta)

**This is a beta version and may have bugs.**

Shogi Instructor is a local coach overlay for lishogi. It captures game state from your browser, syncs SFEN into a local Vue app, runs engine analysis, and asks an LLM to coach you based on whose move it is.

## How it works (high level)

- **Browser**: you paste `scripts/bridge.js` into the lishogi DevTools Console. It hooks lishogi XHR and extracts `steps` plus `player.color`.
- **Backend** (`FastAPI`): receives chunked payloads at `GET /api/chunk`, stores the latest state, and serves it at `GET /api/state` on `http://127.0.0.1:3080`.
- **Frontend** (`Vue + Vite`): polls `/api/state`, extracts SFEN + `player.color`, updates the board, runs engine analysis, and prompts the LLM with:
  - player is **sente/gote**
  - who **just moved**
  - who is **to move** now

## Prerequisites (Windows)

- **Windows 10/11**
- **Node.js**: `^20.19.0 || >=22.12.0`
- **Python**: 3.10+ recommended
- **Git**: for cloning and updates
- **PowerShell script policy** (only if activation fails):
  - `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Quick start (recommended, CLI)

From the repo root in PowerShell:

```powershell
python cli.py
```

If the menu does not appear, run:

```powershell
python cli.py interactive
```

Choose a task:

```
? Choose a task to perform: (Use arrow keys)
 » build-all - Execute the complete build process (backend + frontend).
   build-backend - Build the backend: create venv, install deps, and package with PyInstaller.
   build-frontend - Build the frontend Electron app using npm.
   dev - Start development servers (backend + frontend) concurrently.
   dev-backend - Start backend development server only.
   dev-frontend - Start frontend development server only.
   clean - Clean build artifacts (dist, build, .venv, node_modules).
   exit - Exit the CLI tool.
```

Recommended choices:
- **`dev`** for live development (starts backend + frontend, stop with **Ctrl+C**).
- **`build-all`** for a packaged app (builds backend EXE + Electron app).

## Use the app (after `dev`)

1. Open a lishogi game in your browser.
2. Inject the bridge script using one of these methods:
   - **DevTools Console**: paste and run `scripts/bridge.js`.
   - **Tampermonkey**: install Tampermonkey and add `scripts/tampermonkeyScriptBridge.txt`.
3. In the Vue app, turn on **Sync lishogi**.

## Build EXE (Windows)

Use the CLI and select:
- `build-all` to build backend + frontend.
- `build-backend` to create the backend EXE (PyInstaller).
- `build-frontend` to build the Electron app.

Expected output folders:
- Backend EXE: `backend/dist/` (PyInstaller output)
- Frontend app + installer: `frontend/dist_electron/`
- Frontend web assets: `frontend/dist/`

Note: the Electron build bundles `backend/dist/backend.exe` into the app, so run `build-backend` (or `build-all`) first.

## Developers

### Dev workflow (CLI)

From the repo root:

```powershell
python cli.py
```

Recommended options:
- `dev` to run backend + frontend together (stop with **Ctrl+C**).
- `dev-backend` to run only the FastAPI server.
- `dev-frontend` to run only the Vite frontend.

### Dev workflow (manual)

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m src.main
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

The backend listens on **`http://127.0.0.1:3080`**.

## Using the bridge script

- DevTools Console: paste and run `scripts/bridge.js`.
- Tampermonkey: install the extension and add `scripts/tampermonkeyScriptBridge.txt`.
- The script continuously sends the latest data to your local backend.

## Notes / troubleshooting

- **Nothing updates**: ensure the backend is running and `http://127.0.0.1:3080/api/health` returns `{"status":"ok" ...}`.
- **Sync errors**: the frontend expects `/api/state` to contain recent data; refresh lishogi and re-run the bridge script.
- **LLM settings**: configure your LLM settings in the app UI (API key, base URL, model).
- **CLI opens but tasks fail**: make sure you are running `python cli.py` from the repo root.
- **PowerShell blocks venv activation**: run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and try again.
- **npm install fails**: ensure Node.js is installed and re-run the task; if needed, delete `frontend/node_modules` and run `clean`.
- **PyInstaller errors**: try `clean`, then re-run `build-backend` to recreate the venv and reinstall deps.

## Licensing / GPL notice

This project uses the open-source Shogi engine **YaneuraOu**: [`https://github.com/yaneurao/YaneuraOu`](https://github.com/yaneurao/YaneuraOu).

YaneuraOu is licensed under **GPL-3.0**, which is a **strong copyleft** license. If you distribute this project (or binaries built from it) in a way that forms a combined/derivative work with GPL-licensed components, you must comply with GPL-3.0 requirements (including providing corresponding source code under GPL-3.0).
